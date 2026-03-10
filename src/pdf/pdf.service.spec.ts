import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PdfService } from './pdf.service';
import { TranslationServiceFactory } from '../translation/factories/translation-service.factory';
import { TranslationProvider } from '../common/enums/translation-provider.enum';

const mockGetText = jest.fn();
const mockDestroy = jest.fn();

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: mockGetText,
    destroy: mockDestroy,
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MockPDFParse = require('pdf-parse').PDFParse as jest.MockedClass<
  new (params: object) => { getText: jest.Mock; destroy: jest.Mock }
>;

const mockTranslationService = {
  translate: jest.fn(),
  translateBatch: jest.fn(),
  getSupportedLanguages: jest.fn(),
};

const mockTranslationServiceFactory = {
  getService: jest.fn().mockReturnValue(mockTranslationService),
};

describe('PdfService', () => {
  let service: PdfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfService,
        {
          provide: TranslationServiceFactory,
          useValue: mockTranslationServiceFactory,
        },
      ],
    }).compile();

    service = module.get<PdfService>(PdfService);
    jest.clearAllMocks();
    // Restore default behavior after clearAllMocks
    mockGetText.mockResolvedValue({
      text: 'extracted text',
      pages: [{ num: 1, text: 'page 1 text' }],
      total: 1,
    });
    mockDestroy.mockResolvedValue(undefined);
    MockPDFParse.mockImplementation(() => ({
      getText: mockGetText,
      destroy: mockDestroy,
    }));
    mockTranslationService.translate.mockResolvedValue('translated text');
    mockTranslationService.getSupportedLanguages.mockResolvedValue(['en', 'ko']);
    mockTranslationServiceFactory.getService.mockReturnValue(
      mockTranslationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractText', () => {
    it('should extract text from valid PDF buffer', async () => {
      const validPdfBuffer = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46]),
        Buffer.from('-1.4 fake content'),
      ]);
      const result = await service.extractText(validPdfBuffer);
      expect(result).toBe('extracted text');
    });

    it('should throw BadRequestException for empty buffer', async () => {
      await expect(service.extractText(Buffer.alloc(0))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for non-PDF buffer', async () => {
      await expect(
        service.extractText(Buffer.from('not a pdf')),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw InternalServerErrorException for corrupt PDF', async () => {
      mockGetText.mockRejectedValue(new Error('corrupt PDF'));

      const fakePdf = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46]),
        Buffer.from('-corrupt-data'),
      ]);
      await expect(service.extractText(fakePdf)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should include original error message in InternalServerErrorException', async () => {
      mockGetText.mockRejectedValue(new Error('specific parse error'));

      const fakePdf = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46]),
        Buffer.from('-corrupt-data'),
      ]);
      await expect(service.extractText(fakePdf)).rejects.toThrow(
        'Failed to extract text from PDF: specific parse error',
      );
    });
  });

  describe('translatePdf', () => {
    it('should return TranslationResultDto', async () => {
      const validPdfBuffer = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46]),
        Buffer.from('-1.4'),
      ]);
      const file = { buffer: validPdfBuffer } as Express.Multer.File;
      const dto = {
        sourceLang: 'en',
        targetLang: 'ko',
        provider: TranslationProvider.DEEPL,
      };

      const result = await service.translatePdf(file, dto);

      expect(result.translatedText).toBe('translated text');
      expect(result.sourceLang).toBe('en');
      expect(result.targetLang).toBe('ko');
      expect(result.provider).toBe(TranslationProvider.DEEPL);
      expect(result.originalText).toBe('extracted text');
    });

    it('should use DEEPL as default provider when none specified', async () => {
      const validPdfBuffer = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46]),
        Buffer.from('-1.4'),
      ]);
      const file = { buffer: validPdfBuffer } as Express.Multer.File;
      const dto = { sourceLang: 'en', targetLang: 'ko' };

      await service.translatePdf(file, dto);

      expect(mockTranslationServiceFactory.getService).toHaveBeenCalledWith(
        TranslationProvider.DEEPL,
      );
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return languages from translation service', async () => {
      const result = await service.getSupportedLanguages(
        TranslationProvider.DEEPL,
      );
      expect(result).toEqual(['en', 'ko']);
      expect(mockTranslationServiceFactory.getService).toHaveBeenCalledWith(
        TranslationProvider.DEEPL,
      );
    });

    it('should use DEEPL as default provider when none specified', async () => {
      await service.getSupportedLanguages();

      expect(mockTranslationServiceFactory.getService).toHaveBeenCalledWith(
        TranslationProvider.DEEPL,
      );
    });
  });
});
