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
    it('should extract text by pages', async () => {
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
  });
});
