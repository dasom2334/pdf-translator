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

    it('should throw BadRequestException when PDF has no text content', async () => {
      const mockGetPage = vi.fn().mockResolvedValue({
        getViewport: mockGetViewport,
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      });
      mockGetDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: 1, getPage: mockGetPage }),
      });

      await expect(service.extractBlocks(validPdfHeader)).rejects.toThrow(
        BadRequestException,
      );
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

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        text: 'Hello World',
        page: 1,
        x: 50,
        fontSize: 12,
        fontName: 'Helvetica',
        width: 80,
        height: 12,
      });
      expect(blocks[1]).toMatchObject({
        text: 'Second line',
        page: 1,
        x: 50,
        fontSize: 10,
        fontName: 'Arial',
        width: 70,
        height: 10,
      });
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
        promise: Promise.resolve({ numPages: 2, getPage: mockGetPage }),
      });

      const result = await service.extractBlocksByPages(validPdfHeader);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].text).toBe('Page 1');
      expect(result[1]).toHaveLength(2);
      expect(result[1][0].text).toBe('Page 2 A');
      expect(result[1][1].text).toBe('Page 2 B');
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
