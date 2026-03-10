import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepLTranslationService } from './deepl-translation.service';
import { TranslationException } from '../../common/exceptions/translation.exception';

const mockTranslator = {
  translateText: jest.fn(),
  getTargetLanguages: jest.fn(),
};

jest.mock('deepl-node', () => ({
  Translator: jest.fn().mockImplementation(() => mockTranslator),
}));

describe('DeepLTranslationService', () => {
  let service: DeepLTranslationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeepLTranslationService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-api-key') },
        },
      ],
    }).compile();

    service = module.get<DeepLTranslationService>(DeepLTranslationService);
    service.onModuleInit();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('translate', () => {
    it('should return translated text', async () => {
      mockTranslator.translateText.mockResolvedValue({ text: '번역된 텍스트' });
      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('번역된 텍스트');
    });

    it('should throw BadRequestException for empty text', async () => {
      await expect(service.translate('', 'en', 'ko')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw TranslationException on DeepL API error', async () => {
      mockTranslator.translateText.mockRejectedValue(new Error('API error'));
      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(
        TranslationException,
      );
    });
  });

  describe('translateBatch', () => {
    it('should return array of translated texts', async () => {
      mockTranslator.translateText.mockResolvedValue([
        { text: '안녕' },
        { text: '세계' },
      ]);
      const result = await service.translateBatch(
        ['Hello', 'World'],
        'en',
        'ko',
      );
      expect(result).toEqual(['안녕', '세계']);
    });

    it('should throw BadRequestException for empty array', async () => {
      await expect(service.translateBatch([], 'en', 'ko')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return language codes', async () => {
      mockTranslator.getTargetLanguages.mockResolvedValue([
        { code: 'en' },
        { code: 'ko' },
      ]);
      const result = await service.getSupportedLanguages();
      expect(result).toEqual(['en', 'ko']);
    });

    it('should throw TranslationException on API error', async () => {
      mockTranslator.getTargetLanguages.mockRejectedValue(
        new Error('API error'),
      );
      await expect(service.getSupportedLanguages()).rejects.toThrow(
        TranslationException,
      );
    });
  });
});
