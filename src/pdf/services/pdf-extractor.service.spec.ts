import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PdfExtractorService } from './pdf-extractor.service';

// Mock the pdfjs loader utility
const mockGetDocument = vi.fn();
vi.mock('../utils/pdfjs-loader', () => ({
  getPdfjs: () => ({ getDocument: mockGetDocument }),
}));

describe('PdfExtractorService', () => {
  let service: PdfExtractorService;

  // Valid PDF magic bytes header: %PDF-1.4
  const validPdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

  // Non-PDF buffer (PNG magic bytes)
  const nonPdfBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

  const mockGetViewport = vi.fn().mockReturnValue({ height: 792 });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfExtractorService],
    }).compile();

    service = module.get<PdfExtractorService>(PdfExtractorService);
    vi.clearAllMocks();
    mockGetViewport.mockReturnValue({ height: 792 });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractBlocks', () => {
    it('should throw BadRequestException for empty buffer', async () => {
      await expect(service.extractBlocks(Buffer.alloc(0))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for non-PDF buffer', async () => {
      await expect(service.extractBlocks(nonPdfBuffer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return empty array when PDF has no text content (image-only PDF)', async () => {
      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: mockGetViewport,
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      expect(blocks).toEqual([]);
    });

    it('should throw InternalServerErrorException when PDF parsing fails', async () => {
      mockGetDocument.mockReturnValue({
        promise: Promise.reject(new Error('Invalid PDF structure')),
      });

      await expect(service.extractBlocks(validPdfHeader)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should return TextBlock[] for a valid PDF with text content', async () => {
      const mockItems = [
        {
          str: 'Hello World',
          transform: [12, 0, 0, 12, 50, 700],
          width: 80,
          height: 12,
          fontName: 'Helvetica',
          hasEOL: false,
        },
        {
          str: 'Second line',
          transform: [10, 0, 0, 10, 50, 680],
          width: 70,
          height: 10,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: mockGetViewport,
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);

      // 문단 병합: Y 좌표 차이가 2pt 초과이면 별개 블록으로 유지된다.
      expect(blocks.length).toBeGreaterThanOrEqual(1);
      const texts = blocks.map((b) => b.text);
      expect(texts.some((t) => t.includes('Hello World'))).toBe(true);
    });

    it('should skip items with empty text after trimming', async () => {
      const mockItems = [
        {
          str: '   ',
          transform: [12, 0, 0, 12, 50, 700],
          width: 10,
          height: 12,
          fontName: 'Helvetica',
          hasEOL: false,
        },
        {
          str: 'Valid text',
          transform: [12, 0, 0, 12, 50, 680],
          width: 60,
          height: 12,
          fontName: 'Helvetica',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: mockGetViewport,
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      expect(blocks.length).toBeGreaterThanOrEqual(1);
      expect(blocks.some((b) => b.text.includes('Valid text'))).toBe(true);
    });

    it('should skip TextMarkedContent items (items without str property)', async () => {
      const mockItems = [
        { type: 'beginMarkedContent', id: 'Span' },
        {
          str: 'Real text',
          transform: [11, 0, 0, 11, 50, 700],
          width: 55,
          height: 11,
          fontName: 'Times',
          hasEOL: false,
        },
        { type: 'endMarkedContent' },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: mockGetViewport,
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].text).toBe('Real text');
    });

    it('should correctly convert PDF coordinates from bottom-left to top-left origin', async () => {
      const pageHeight = 792;
      const pdfY = 700;
      const itemHeight = 12;

      const mockItems = [
        {
          str: 'Test',
          transform: [12, 0, 0, 12, 100, pdfY],
          width: 30,
          height: itemHeight,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ height: pageHeight }),
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      expect(blocks[0].y).toBe(pageHeight - pdfY - itemHeight);
    });

    it('should handle multi-page PDFs', async () => {
      const page1Items = [
        {
          str: 'Page 1 text',
          transform: [12, 0, 0, 12, 50, 700],
          width: 80,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];
      const page2Items = [
        {
          str: 'Page 2 text',
          transform: [12, 0, 0, 12, 50, 700],
          width: 80,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi
        .fn()
        .mockResolvedValueOnce({
          getViewport: mockGetViewport,
          getTextContent: vi.fn().mockResolvedValue({ items: page1Items }),
        })
        .mockResolvedValueOnce({
          getViewport: mockGetViewport,
          getTextContent: vi.fn().mockResolvedValue({ items: page2Items }),
        });

      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 2, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(blocks.some((b) => b.page === 1 && b.text.includes('Page 1 text'))).toBe(true);
      expect(blocks.some((b) => b.page === 2 && b.text.includes('Page 2 text'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 좌표 기반 읽기 순서 정렬 (Y → X)
  // -------------------------------------------------------------------------
  describe('reading order sort (Y→X 좌표 기준)', () => {
    it('should sort blocks top-to-bottom then left-to-right', async () => {
      // Three items: bottom-left, top-right, top-left
      // Expected order after sort: top-left, top-right, bottom-left
      const pageHeight = 792;
      const mockItems = [
        {
          str: 'Bottom-left',
          transform: [12, 0, 0, 12, 50, 100],   // pdfY=100 → y=680
          width: 80,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: 'Top-right',
          transform: [12, 0, 0, 12, 300, 700],  // pdfY=700 → y=80
          width: 80,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: 'Top-left',
          transform: [12, 0, 0, 12, 50, 700],   // pdfY=700 → y=80, same line
          width: 80,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ height: pageHeight }),
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      // After sort+merge: top line (y≈80) comes before bottom line (y≈680)
      // Top-left (x=50) should appear before or merged with Top-right (x=300)
      const firstBlock = blocks[0];
      expect(firstBlock.y).toBeLessThan(blocks[blocks.length - 1].y);
    });
  });

  // -------------------------------------------------------------------------
  // 헤더/푸터 자동 감지 및 제거
  // -------------------------------------------------------------------------
  describe('header/footer 자동 감지 및 제거', () => {
    it('should remove repeating header text present on multiple pages', async () => {
      const pageHeight = 792;
      const headerY = 770; // near top → converted y ≈ 10 (within 8% = 63pt threshold)

      const makePageItems = (bodyText: string) => [
        {
          str: 'Page Header',
          transform: [10, 0, 0, 10, 50, headerY],
          width: 100,
          height: 10,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: bodyText,
          transform: [12, 0, 0, 12, 50, 400],
          width: 200,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi
        .fn()
        .mockResolvedValueOnce({
          getViewport: vi.fn().mockReturnValue({ height: pageHeight }),
          getTextContent: vi.fn().mockResolvedValue({ items: makePageItems('Body page 1') }),
        })
        .mockResolvedValueOnce({
          getViewport: vi.fn().mockReturnValue({ height: pageHeight }),
          getTextContent: vi.fn().mockResolvedValue({ items: makePageItems('Body page 2') }),
        });

      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 2, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      // 'Page Header' should have been removed from both pages
      const texts = blocks.map((b) => b.text);
      expect(texts.some((t) => t.includes('Page Header'))).toBe(false);
      expect(texts.some((t) => t.includes('Body page 1'))).toBe(true);
      expect(texts.some((t) => t.includes('Body page 2'))).toBe(true);
    });

    it('should NOT remove text that only appears on one page even if in header zone', async () => {
      const pageHeight = 792;
      const headerY = 770;

      const mockGetPage = vi
        .fn()
        .mockResolvedValueOnce({
          getViewport: vi.fn().mockReturnValue({ height: pageHeight }),
          getTextContent: vi.fn().mockResolvedValue({
            items: [
              {
                str: 'Unique title',
                transform: [14, 0, 0, 14, 50, headerY],
                width: 120,
                height: 14,
                fontName: 'Arial',
                hasEOL: false,
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          getViewport: vi.fn().mockReturnValue({ height: pageHeight }),
          getTextContent: vi.fn().mockResolvedValue({
            items: [
              {
                str: 'Different title',
                transform: [14, 0, 0, 14, 50, headerY],
                width: 120,
                height: 14,
                fontName: 'Arial',
                hasEOL: false,
              },
            ],
          }),
        });

      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 2, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      const texts = blocks.map((b) => b.text);
      // Both titles are unique to their respective pages → should be retained
      expect(texts.some((t) => t.includes('Unique title'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 공백·특수문자 정제
  // -------------------------------------------------------------------------
  describe('공백 및 특수문자 정제', () => {
    it('should collapse multiple spaces into a single space', async () => {
      const mockItems = [
        {
          str: 'Hello    World',
          transform: [12, 0, 0, 12, 50, 400],
          width: 100,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: mockGetViewport,
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      expect(blocks[0].text).toBe('Hello World');
    });

    it('should collapse tab and newline characters', async () => {
      const mockItems = [
        {
          str: 'Line1\tLine2\nLine3',
          transform: [12, 0, 0, 12, 50, 400],
          width: 100,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: mockGetViewport,
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      expect(blocks[0].text).toBe('Line1 Line2 Line3');
    });
  });

  // -------------------------------------------------------------------------
  // 인접 TextBlock 문단 병합
  // -------------------------------------------------------------------------
  describe('인접 블록 문단 병합', () => {
    it('should merge adjacent blocks on the same line', async () => {
      const pageHeight = 792;
      // Two items at the same Y and close X positions — should merge
      const mockItems = [
        {
          str: 'Hello',
          transform: [12, 0, 0, 12, 50, 400],
          width: 40,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: 'World',
          transform: [12, 0, 0, 12, 92, 400], // x=92 — gap=92-(50+40)=2 ≤ MAX_MERGE_GAP
          width: 40,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ height: pageHeight }),
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      // The two adjacent items should be merged into one block
      expect(blocks).toHaveLength(1);
      expect(blocks[0].text).toContain('Hello');
      expect(blocks[0].text).toContain('World');
    });

    it('should NOT merge blocks with large horizontal gap', async () => {
      const pageHeight = 792;
      const mockItems = [
        {
          str: 'Left',
          transform: [12, 0, 0, 12, 50, 400],
          width: 40,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: 'Right',
          transform: [12, 0, 0, 12, 300, 400], // gap = 300-(50+40)=210 >> MAX_MERGE_GAP
          width: 40,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ height: pageHeight }),
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      expect(blocks).toHaveLength(2);
    });

    it('should NOT merge blocks on different lines', async () => {
      const pageHeight = 792;
      const mockItems = [
        {
          str: 'Line 1',
          transform: [12, 0, 0, 12, 50, 400],
          width: 60,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: 'Line 2',
          transform: [12, 0, 0, 12, 50, 380], // pdfY differs by 20pt → different line
          width: 60,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ height: pageHeight }),
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      expect(blocks).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // pdfjs 인스턴스 destroy() 호출 보장 (메모리 릭 방지)
  // -------------------------------------------------------------------------
  describe('pdfjs destroy() 호출 보장', () => {
    it('extractBlocks: 정상 추출 후 destroy()가 1회 호출되어야 한다', async () => {
      const mockDestroy = vi.fn().mockResolvedValue(undefined);
      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: mockGetViewport,
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: mockDestroy }),
      });

      await service.extractBlocks(validPdfHeader);
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('extractBlocks: 페이지 추출 실패 시에도 destroy()가 1회 호출되어야 한다', async () => {
      const mockDestroy = vi.fn().mockResolvedValue(undefined);
      const mockGetPage = vi.fn().mockRejectedValue(new Error('page error'));
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: mockDestroy }),
      });

      await expect(service.extractBlocks(validPdfHeader)).rejects.toThrow();
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('extractBlocksByPages: 정상 추출 후 destroy()가 1회 호출되어야 한다', async () => {
      const mockDestroy = vi.fn().mockResolvedValue(undefined);
      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: mockGetViewport,
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 2, getPage: mockGetPage, destroy: mockDestroy }),
      });

      await service.extractBlocksByPages(validPdfHeader);
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('extractBlocksByPages: 페이지 추출 실패 시에도 destroy()가 1회 호출되어야 한다', async () => {
      const mockDestroy = vi.fn().mockResolvedValue(undefined);
      const mockGetPage = vi.fn().mockRejectedValue(new Error('page error'));
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage, destroy: mockDestroy }),
      });

      await expect(service.extractBlocksByPages(validPdfHeader)).rejects.toThrow();
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('extractBlocksByPages', () => {
    it('should throw BadRequestException for empty buffer', async () => {
      await expect(
        service.extractBlocksByPages(Buffer.alloc(0)),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-PDF buffer', async () => {
      await expect(service.extractBlocksByPages(nonPdfBuffer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return all pages when no pageRange given', async () => {
      const mockItems = [
        {
          str: 'Text',
          transform: [12, 0, 0, 12, 50, 700],
          width: 30,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: mockGetViewport,
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 3, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const result = await service.extractBlocksByPages(validPdfHeader);
      expect(result).toHaveLength(3);
      expect(mockGetPage).toHaveBeenCalledTimes(3);
    });

    it('should return all pages when pageRange is empty string', async () => {
      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: mockGetViewport,
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 3, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const result = await service.extractBlocksByPages(validPdfHeader, '');
      expect(result).toHaveLength(3);
      expect(mockGetPage).toHaveBeenCalledTimes(3);
    });

    it('should return all pages when pageRange is whitespace-only', async () => {
      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: mockGetViewport,
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 3, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const result = await service.extractBlocksByPages(validPdfHeader, '   ');
      expect(result).toHaveLength(3);
      expect(mockGetPage).toHaveBeenCalledTimes(3);
    });

    it('should return only specified pages when pageRange given', async () => {
      const mockItems = [
        {
          str: 'Text',
          transform: [12, 0, 0, 12, 50, 700],
          width: 30,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: mockGetViewport,
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 5, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const result = await service.extractBlocksByPages(validPdfHeader, '1-2,4');
      expect(result).toHaveLength(3);
      expect(mockGetPage).toHaveBeenCalledWith(1);
      expect(mockGetPage).toHaveBeenCalledWith(2);
      expect(mockGetPage).toHaveBeenCalledWith(4);
      expect(mockGetPage).not.toHaveBeenCalledWith(3);
      expect(mockGetPage).not.toHaveBeenCalledWith(5);
    });

    it('should return array of TextBlock[] per page', async () => {
      const page1Items = [
        {
          str: 'Page 1',
          transform: [12, 0, 0, 12, 50, 700],
          width: 40,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];
      const page2Items = [
        {
          str: 'Page 2 A',
          transform: [10, 0, 0, 10, 50, 700],
          width: 50,
          height: 10,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: 'Page 2 B',
          transform: [10, 0, 0, 10, 50, 680],
          width: 50,
          height: 10,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi
        .fn()
        .mockResolvedValueOnce({
          getViewport: mockGetViewport,
          getTextContent: vi.fn().mockResolvedValue({ items: page1Items }),
        })
        .mockResolvedValueOnce({
          getViewport: mockGetViewport,
          getTextContent: vi.fn().mockResolvedValue({ items: page2Items }),
        });

      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 2, getPage: mockGetPage, destroy: vi.fn().mockResolvedValue(undefined) }),
      });

      const result = await service.extractBlocksByPages(validPdfHeader);
      expect(result).toHaveLength(2);
      expect(result[0].length).toBeGreaterThanOrEqual(1);
      expect(result[0].some((b) => b.text.includes('Page 1'))).toBe(true);
      expect(result[1].length).toBeGreaterThanOrEqual(1);
    });

    it('should throw InternalServerErrorException when PDF parsing fails', async () => {
      mockGetDocument.mockReturnValue({
        promise: Promise.reject(new Error('Corrupted PDF')),
      });

      await expect(
        service.extractBlocksByPages(validPdfHeader),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
