import { Test, TestingModule } from '@nestjs/testing';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';
import { TranslationServiceFactory } from '../translation/factories/translation-service.factory';
import { TranslationProvider } from '../common/enums/translation-provider.enum';
import { TranslatePdfDto } from './dto/translate-pdf.dto';

const mockPdfService = {
  translatePdf: jest.fn(),
  getSupportedLanguages: jest.fn().mockResolvedValue(['en', 'ko']),
};

const mockTranslationServiceFactory = {
  getService: jest.fn(),
};

describe('PdfController', () => {
  let controller: PdfController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PdfController],
      providers: [
        { provide: PdfService, useValue: mockPdfService },
        {
          provide: TranslationServiceFactory,
          useValue: mockTranslationServiceFactory,
        },
      ],
    }).compile();

    controller = module.get<PdfController>(PdfController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('translatePdf', () => {
    it('should call pdfService.translatePdf and return result', async () => {
      const mockResult = {
        originalText: 'hello',
        translatedText: '안녕',
        sourceLang: 'en',
        targetLang: 'ko',
        provider: TranslationProvider.DEEPL,
      };
      mockPdfService.translatePdf = jest.fn().mockResolvedValue(mockResult);
      const file = { buffer: Buffer.from('fake') } as Express.Multer.File;
      const dto = { sourceLang: 'en', targetLang: 'ko' } as TranslatePdfDto;
      const result = await controller.translatePdf(file, dto);
      expect(result).toEqual(mockResult);
      expect(mockPdfService.translatePdf).toHaveBeenCalledWith(file, dto);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return supported languages', async () => {
      mockPdfService.getSupportedLanguages.mockResolvedValue(['en', 'ko']);
      const result = await controller.getSupportedLanguages(
        TranslationProvider.DEEPL,
      );
      expect(result).toEqual(['en', 'ko']);
    });
  });
});
