import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { GeminiTranslationService } from './gemini-translation.service';
import { TranslationException } from '../../common/exceptions/translation.exception';

vi.mock('@google/generative-ai', () => {
  const mockGenerateContent = vi.fn();
  const mockGetGenerativeModel = vi.fn().mockReturnValue({
    generateContent: mockGenerateContent,
  });
  const MockGoogleGenerativeAI = vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  }));
  return { GoogleGenerativeAI: MockGoogleGenerativeAI };
});

import { GoogleGenerativeAI } from '@google/generative-ai';

describe('GeminiTranslationService', () => {
  let service: GeminiTranslationService;
  let mockGenerateContent: ReturnType<typeof vi.fn>;

  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-api-key' };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GeminiTranslationService],
    }).compile();

    service = module.get<GeminiTranslationService>(GeminiTranslationService);
    service.onModuleInit();

    const mockAIInstance = (GoogleGenerativeAI as ReturnType<typeof vi.fn>).mock.results[
      (GoogleGenerativeAI as ReturnType<typeof vi.fn>).mock.results.length - 1
    ].value as { getGenerativeModel: ReturnType<typeof vi.fn> };
    const mockModel = mockAIInstance.getGenerativeModel({ model: 'gemini-1.5-flash' }) as {
      generateContent: ReturnType<typeof vi.fn>;
    };
    mockGenerateContent = mockModel.generateContent;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should throw Error when GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;

      const module: TestingModule = await Test.createTestingModule({
        providers: [GeminiTranslationService],
      }).compile();

      const uninitializedService = module.get<GeminiTranslationService>(GeminiTranslationService);
      expect(() => uninitializedService.onModuleInit()).toThrow(Error);
      expect(() => uninitializedService.onModuleInit()).toThrow('GEMINI_API_KEY');
    });

    it('should initialize with valid API key', () => {
      expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-api-key');
    });
  });

  describe('translate', () => {
    it('should translate text successfully', async () => {
      mockGenerateContent.mockResolvedValueOnce({
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

    it('should throw TranslationException on non-rate-limit error', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('API error'));
      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
    });

    it('should retry on rate limit error with exponential backoff', async () => {
      vi.useFakeTimers();

      const rateLimitError = new Error('429 Too Many Requests: rate limit exceeded');
      mockGenerateContent
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          response: { text: () => '번역됨' },
        });

      const translatePromise = service.translate('Hello', 'en', 'ko');
      await vi.runAllTimersAsync();

      const result = await translatePromise;
      expect(result).toBe('번역됨');
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('should throw TranslationException after max retries on rate limit', async () => {
      vi.useFakeTimers();

      const rateLimitError = new Error('429 rate limit');
      mockGenerateContent.mockRejectedValue(rateLimitError);

      const translatePromise = service.translate('Hello', 'en', 'ko').catch((e) => e);
      await vi.runAllTimersAsync();

      const result = await translatePromise;
      expect(result).toBeInstanceOf(TranslationException);
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('should split long text and join translated chunks', async () => {
      const longParagraph1 = 'A '.repeat(2000).trim();
      const longParagraph2 = 'B '.repeat(2000).trim();
      const longText = `${longParagraph1}\n\n${longParagraph2}`;

      mockGenerateContent
        .mockResolvedValueOnce({ response: { text: () => '청크1' } })
        .mockResolvedValueOnce({ response: { text: () => '청크2' } });

      const result = await service.translate(longText, 'en', 'ko');
      expect(result).toBe('청크1\n\n청크2');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('should include source and target lang in prompt', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => 'Hola' },
      });

      await service.translate('Hello', 'en', 'es');
      const callArg = mockGenerateContent.mock.calls[0][0] as string;
      expect(callArg).toContain('en');
      expect(callArg).toContain('es');
    });
  });

  describe('translateBatch', () => {
    it('should translate all texts sequentially', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({ response: { text: () => '안녕하세요' } })
        .mockResolvedValueOnce({ response: { text: () => '세계' } });

      const results = await service.translateBatch(['Hello', 'World'], 'en', 'ko');
      expect(results).toEqual(['안녕하세요', '세계']);
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('should return empty array for empty input', async () => {
      const results = await service.translateBatch([], 'en', 'ko');
      expect(results).toEqual([]);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return an array of language codes', async () => {
      const languages = await service.getSupportedLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
      expect(languages).toContain('en');
      expect(languages).toContain('ko');
    });
  });
});
