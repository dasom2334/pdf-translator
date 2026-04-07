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
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage }),
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
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);

      // After E-2 processing, blocks may be merged if they are adjacent on the same line.
      // The two items have different Y values (680, 700) so they won't merge.
      // They should be sorted by Y (top-down): item at y=700 → top-left y=80, item at y=680 → top-left y=102
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
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].text).toBe('Valid text');
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
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage }),
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
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage }),
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
        promise: Promise.resolve({ numPages: 2, getPage: mockGetPage }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].page).toBe(1);
      expect(blocks[0].text).toBe('Page 1 text');
      expect(blocks[1].page).toBe(2);
      expect(blocks[1].text).toBe('Page 2 text');
    });

    // -------------------------------------------------------------------------
    // E-2: Reading order — Y then X sort
    // -------------------------------------------------------------------------

    it('should sort blocks in reading order (Y then X)', async () => {
      // Items intentionally in wrong order: lower Y (higher on page) should come first
      const mockItems = [
        {
          str: 'Bottom left',
          transform: [12, 0, 0, 12, 50, 200], // pdfY=200 → topY=580
          width: 60,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: 'Top right',
          transform: [12, 0, 0, 12, 300, 700], // pdfY=700 → topY=80
          width: 60,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: 'Top left',
          transform: [12, 0, 0, 12, 50, 700], // pdfY=700 → topY=80, same line as 'Top right'
          width: 60,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ height: 792 }),
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);

      // After merge: 'Top left' and 'Top right' are on the same Y and may merge.
      // 'Bottom left' should be last.
      const lastBlock = blocks[blocks.length - 1];
      expect(lastBlock.text).toContain('Bottom left');
    });

    // -------------------------------------------------------------------------
    // E-2: Header/footer detection across pages
    // -------------------------------------------------------------------------

    it('should remove repeated header/footer text across pages', async () => {
      // Page height = 792, header zone = top 55pt (7%), footer zone = bottom 55pt
      // Header text at pdfY=755 → topY = 792 - 755 - 12 = 25 (in header zone)
      // Footer text at pdfY=20 → topY = 792 - 20 - 12 = 760 (in footer zone)
      // Body text at pdfY=400 → topY = 792 - 400 - 12 = 380 (body)

      const headerText = 'Company Confidential';
      const bodyText = 'Main content';

      const makePageItems = (footerLabel: string) => [
        {
          str: headerText,
          transform: [12, 0, 0, 12, 50, 755],
          width: 100,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: bodyText,
          transform: [12, 0, 0, 12, 50, 400],
          width: 80,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: footerLabel,
          transform: [12, 0, 0, 12, 50, 20],
          width: 40,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      // Header text repeats on both pages; footer text differs (Page 1 vs Page 2)
      const mockGetPage = vi
        .fn()
        .mockResolvedValueOnce({
          getViewport: vi.fn().mockReturnValue({ height: 792 }),
          getTextContent: vi.fn().mockResolvedValue({ items: makePageItems('Page 1') }),
        })
        .mockResolvedValueOnce({
          getViewport: vi.fn().mockReturnValue({ height: 792 }),
          getTextContent: vi.fn().mockResolvedValue({ items: makePageItems('Page 1') }),
        });

      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 2, getPage: mockGetPage }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);

      // 'Company Confidential' should be removed (appears on both pages in header zone)
      // 'Page 1' appears on both pages in footer zone → also removed
      // 'Main content' should remain
      const texts = blocks.map((b) => b.text);
      expect(texts.every((t) => !t.includes(headerText))).toBe(true);
      expect(texts.some((t) => t.includes(bodyText))).toBe(true);
    });

    // -------------------------------------------------------------------------
    // E-2: Adjacent block merging
    // -------------------------------------------------------------------------

    it('should merge horizontally adjacent blocks on the same line', async () => {
      // Two items on the same Y, close together horizontally
      const mockItems = [
        {
          str: 'Hello',
          transform: [12, 0, 0, 12, 50, 500],
          width: 30,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: 'World',
          transform: [12, 0, 0, 12, 82, 500], // gap = 82 - (50+30) = 2 → within MERGE_GAP_THRESHOLD
          width: 30,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ height: 792 }),
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);

      // Should be merged into one block
      expect(blocks).toHaveLength(1);
      expect(blocks[0].text).toBe('Hello World');
    });

    it('should NOT merge blocks that are far apart on the same line', async () => {
      const mockItems = [
        {
          str: 'Left column',
          transform: [12, 0, 0, 12, 50, 500],
          width: 60,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: 'Right column',
          transform: [12, 0, 0, 12, 400, 500], // gap = 400 - (50+60) = 290 → far
          width: 60,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];

      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ height: 792 }),
        getTextContent: vi.fn().mockResolvedValue({ items: mockItems }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);

      expect(blocks).toHaveLength(2);
    });

    // -------------------------------------------------------------------------
    // E-2: Text sanitization
    // -------------------------------------------------------------------------

    it('should sanitize control characters from text', async () => {
      const mockItems = [
        {
          str: 'Clean\x01\x02text',
          transform: [12, 0, 0, 12, 50, 500],
          width: 50,
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
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage }),
      });

      const blocks = await service.extractBlocks(validPdfHeader);
      expect(blocks[0].text).toBe('Cleantext');
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
          transform: [12, 0, 0, 12, 50, 400],
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
        promise: Promise.resolve({ numPages: 3, getPage: mockGetPage }),
      });

      const result = await service.extractBlocksByPages(validPdfHeader);
      expect(result).toHaveLength(3);
      expect(mockGetPage).toHaveBeenCalledTimes(3);
    });

    it('should return only specified pages when pageRange given', async () => {
      const mockItems = [
        {
          str: 'Text',
          transform: [12, 0, 0, 12, 50, 400],
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
        promise: Promise.resolve({ numPages: 5, getPage: mockGetPage }),
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
          transform: [12, 0, 0, 12, 50, 400],
          width: 40,
          height: 12,
          fontName: 'Arial',
          hasEOL: false,
        },
      ];
      const page2Items = [
        {
          str: 'Page 2 A',
          transform: [10, 0, 0, 10, 50, 400],
          width: 50,
          height: 10,
          fontName: 'Arial',
          hasEOL: false,
        },
        {
          str: 'Page 2 B',
          transform: [10, 0, 0, 10, 50, 380],
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
        promise: Promise.resolve({ numPages: 2, getPage: mockGetPage }),
      });

      const result = await service.extractBlocksByPages(validPdfHeader);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].text).toBe('Page 1');
      // page2 items: y values differ (400 vs 380), so they won't merge
      expect(result[1]).toHaveLength(2);
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
