import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiTranslationService } from './gemini-translation.service';
import { TranslationException } from '../../common/exceptions/translation.exception';

// Mock @google/generative-ai
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContent: mockGenerateContent,
});

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

describe('GeminiTranslationService', () => {
  let service: GeminiTranslationService;

  const mockConfigServiceWithKey = {
    get: jest.fn().mockReturnValue('test-api-key'),
  };

  const mockConfigServiceWithoutKey = {
    get: jest.fn().mockReturnValue(undefined),
  };

  afterEach(() => jest.clearAllMocks());

  describe('onModuleInit', () => {
    it('should initialize successfully when API key is present', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          GeminiTranslationService,
          { provide: ConfigService, useValue: mockConfigServiceWithKey },
        ],
      }).compile();

      service = moduleRef.get(GeminiTranslationService);
      expect(() => service.onModuleInit()).not.toThrow();
    });

    it('should throw Error when API key is missing', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          GeminiTranslationService,
          { provide: ConfigService, useValue: mockConfigServiceWithoutKey },
        ],
      }).compile();

      service = moduleRef.get(GeminiTranslationService);
      expect(() => service.onModuleInit()).toThrow(
        'GEMINI_API_KEY environment variable is not set',
      );
    });
  });

  describe('with initialized service', () => {
    beforeEach(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          GeminiTranslationService,
          { provide: ConfigService, useValue: mockConfigServiceWithKey },
        ],
      }).compile();

      service = moduleRef.get(GeminiTranslationService);
      service.onModuleInit();
    });

    describe('translate', () => {
      it('should translate text successfully', async () => {
        mockGenerateContent.mockResolvedValue({
          response: { text: () => '안녕하세요' },
        });

        const result = await service.translate('Hello', 'en', 'ko');
        expect(result).toBe('안녕하세요');
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      });

      it('should throw BadRequestException for empty text', async () => {
        await expect(service.translate('', 'en', 'ko')).rejects.toThrow(BadRequestException);
      });

      it('should throw BadRequestException for whitespace-only text', async () => {
        await expect(service.translate('   ', 'en', 'ko')).rejects.toThrow(BadRequestException);
      });

      it('should throw TranslationException on API error', async () => {
        mockGenerateContent.mockRejectedValue(new Error('API quota exceeded'));

        await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
      });

      it('should include glossary terms in the prompt', async () => {
        mockGenerateContent.mockResolvedValue({
          response: { text: () => '번역된 텍스트' },
        });

        const glossary = [{ source: 'AI', target: '인공지능' }];
        await service.translate('AI is great', 'en', 'ko', glossary);

        expect(mockGenerateContent).toHaveBeenCalledWith(
          expect.stringContaining('"AI" → "인공지능"'),
        );
      });

      it('should trim the translated result', async () => {
        mockGenerateContent.mockResolvedValue({
          response: { text: () => '  안녕하세요  ' },
        });

        const result = await service.translate('Hello', 'en', 'ko');
        expect(result).toBe('안녕하세요');
      });
    });

    describe('translateBatch', () => {
      it('should translate multiple texts sequentially', async () => {
        mockGenerateContent
          .mockResolvedValueOnce({ response: { text: () => '안녕하세요' } })
          .mockResolvedValueOnce({ response: { text: () => '세계' } });

        const result = await service.translateBatch(['Hello', 'World'], 'en', 'ko');
        expect(result).toHaveLength(2);
        expect(result[0]).toBe('안녕하세요');
        expect(result[1]).toBe('세계');
      });

      it('should throw TranslationException if one item fails', async () => {
        mockGenerateContent.mockRejectedValue(new Error('API error'));

        await expect(
          service.translateBatch(['Hello', 'World'], 'en', 'ko'),
        ).rejects.toThrow(TranslationException);
      });
    });

    describe('getSupportedLanguages', () => {
      it('should return a non-empty array of language codes', async () => {
        const langs = await service.getSupportedLanguages();
        expect(Array.isArray(langs)).toBe(true);
        expect(langs.length).toBeGreaterThan(0);
      });

      it('should include common language codes', async () => {
        const langs = await service.getSupportedLanguages();
        expect(langs).toContain('en');
        expect(langs).toContain('ko');
        expect(langs).toContain('ja');
        expect(langs).toContain('zh');
      });
    });
  });
});
