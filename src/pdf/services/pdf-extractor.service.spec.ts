import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PdfExtractorService } from './pdf-extractor.service';

const VALID_PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);

jest.mock('pdf-parse', () =>
  jest.fn().mockImplementation((buffer: Buffer, options?: { pagerender?: (page: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => Promise<string> }) => {
    if (options?.pagerender) {
      const mockPage = {
        getTextContent: () => Promise.resolve({ items: [{ str: 'page text' }] }),
      };
      return options.pagerender(mockPage).then(() => ({ text: 'page text', numpages: 1 }));
    }
    return Promise.resolve({ text: 'extracted text', numpages: 1 });
  }),
);

describe('PdfExtractorService', () => {
  let service: PdfExtractorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PdfExtractorService],
    }).compile();
    service = moduleRef.get(PdfExtractorService);
  });

  describe('extractText', () => {
    it('should extract text from valid PDF', async () => {
      const validPdf = Buffer.concat([VALID_PDF_MAGIC, Buffer.alloc(100)]);
      const result = await service.extractText(validPdf);
      expect(result).toBe('extracted text');
    });

    it('should throw BadRequestException for empty buffer', async () => {
      await expect(service.extractText(Buffer.alloc(0))).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-PDF file', async () => {
      await expect(service.extractText(Buffer.from('not a pdf'))).rejects.toThrow(BadRequestException);
    });
  });

  describe('extractTextByPages', () => {
    it('should extract text by pages without page range', async () => {
      const validPdf = Buffer.concat([VALID_PDF_MAGIC, Buffer.alloc(100)]);
      const result = await service.extractTextByPages(validPdf);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should throw BadRequestException for empty buffer', async () => {
      await expect(service.extractTextByPages(Buffer.alloc(0))).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-PDF file', async () => {
      await expect(service.extractTextByPages(Buffer.from('not a pdf'))).rejects.toThrow(BadRequestException);
    });

    it('should filter pages by page range', async () => {
      const validPdf = Buffer.concat([VALID_PDF_MAGIC, Buffer.alloc(100)]);
      const result = await service.extractTextByPages(validPdf, '1');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('parsePageRange', () => {
    it('should parse single page number', () => {
      const result = service.parsePageRange('1', 5);
      expect(result).toEqual([0]);
    });

    it('should parse page range with dash', () => {
      const result = service.parsePageRange('1-3', 5);
      expect(result).toEqual([0, 1, 2]);
    });

    it('should parse mixed ranges', () => {
      const result = service.parsePageRange('1-2,4,6-7', 10);
      expect(result).toEqual([0, 1, 3, 5, 6]);
    });

    it('should clamp range to total pages', () => {
      const result = service.parsePageRange('3-10', 5);
      expect(result).toEqual([2, 3, 4]);
    });

    it('should skip pages beyond total pages', () => {
      const result = service.parsePageRange('6', 5);
      expect(result).toEqual([]);
    });

    it('should throw BadRequestException for invalid range format', () => {
      expect(() => service.parsePageRange('abc', 5)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid dash range', () => {
      expect(() => service.parsePageRange('5-2', 10)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for zero page number', () => {
      expect(() => service.parsePageRange('0', 5)).toThrow(BadRequestException);
    });
  });
});
