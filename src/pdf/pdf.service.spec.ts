import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PdfService } from './pdf.service';
import { TranslationServiceFactory } from '../translation/factories/translation-service.factory';
import { TranslationProvider } from '../common/enums/translation-provider.enum';

const mockTranslationService = {
  translate: jest.fn().mockResolvedValue('translated text'),
  translateBatch: jest.fn().mockResolvedValue(['translated']),
  getSupportedLanguages: jest.fn().mockResolvedValue(['en', 'ko']),
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractText', () => {
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
      const fakePdf = Buffer.from('%PDF-corrupt-data');
      await expect(service.extractText(fakePdf)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return languages from translation service', async () => {
      mockTranslationServiceFactory.getService.mockReturnValue(
        mockTranslationService,
      );
      mockTranslationService.getSupportedLanguages.mockResolvedValue([
        'en',
        'ko',
      ]);
      const result = await service.getSupportedLanguages(
        TranslationProvider.DEEPL,
      );
      expect(result).toEqual(['en', 'ko']);
      expect(mockTranslationServiceFactory.getService).toHaveBeenCalledWith(
        TranslationProvider.DEEPL,
      );
    });
  });
});
