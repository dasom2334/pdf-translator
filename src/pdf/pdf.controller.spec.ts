import { Test, TestingModule } from '@nestjs/testing';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';
import { TranslationServiceFactory } from '../translation/factories/translation-service.factory';
import { TranslationProvider } from '../common/enums/translation-provider.enum';

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
