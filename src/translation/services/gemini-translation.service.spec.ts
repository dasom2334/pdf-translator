import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { GeminiTranslationService } from './gemini-translation.service';
import { GlossaryService } from './glossary.service';
import { TranslationException } from '../../common/exceptions/translation.exception';

vi.mock('@google/generative-ai');

import { GoogleGenerativeAI, mockGenerateContent } from '@google/generative-ai';

describe('GeminiTranslationService', () => {
  let service: GeminiTranslationService;

  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-api-key' };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GlossaryService, GeminiTranslationService],
    }).compile();

    service = module.get<GeminiTranslationService>(GeminiTranslationService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getModel (lazy init)', () => {
    it('should throw TranslationException when GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;

      const module: TestingModule = await Test.createTestingModule({
        providers: [GlossaryService, GeminiTranslationService],
      }).compile();

      const uninitializedService = module.get<GeminiTranslationService>(GeminiTranslationService);
      await expect(uninitializedService.translate('hello', 'en', 'ko')).rejects.toThrow(TranslationException);
      await expect(uninitializedService.translate('hello', 'en', 'ko')).rejects.toThrow('GEMINI_API_KEY');
    });

    it('should initialize with valid API key on first translate call', async () => {
      (vi.mocked(GoogleGenerativeAI) as ReturnType<typeof vi.fn>).mockClear();
      mockGenerateContent.mockResolvedValueOnce({ response: { text: () => '안녕' } });
      await service.translate('hello', 'en', 'ko');
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
      // Use two distinct sentences that fit cleanly into separate chunks at 4000 char limit
      const sentence1 = 'This is the first sentence. ';
      const sentence2 = 'This is the second sentence. ';
      // Each paragraph is under 4000 chars so we get 2 chunks (one per paragraph)
      const para1 = sentence1.repeat(100).trim(); // ~2800 chars
      const para2 = sentence2.repeat(100).trim(); // ~2900 chars
      const longText = `${para1}\n\n${para2}`;

      // With sentence-level overlap each chunk is still separate paragraphs
      // Mock enough responses for all resulting chunks
      mockGenerateContent.mockResolvedValue({ response: { text: () => '청크번역' } });

      const result = await service.translate(longText, 'en', 'ko');
      expect(result).toContain('청크번역');
      expect(mockGenerateContent).toHaveBeenCalled();
    }, 15000);

    it('should include source and target lang in prompt', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => 'Hola' },
      });

      await service.translate('Hello', 'en', 'es');
      const callArg = mockGenerateContent.mock.calls[0][0] as string;
      expect(callArg).toContain('en');
      expect(callArg).toContain('es');
    });

    it('should strip HTML tags from translation result', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => '<b>안녕하세요</b>' },
      });
      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕하세요');
    });

    it('should collapse extra whitespace in translation result', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => '안녕  하세요' },
      });
      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕 하세요');
    });
  });

  describe('translateBatch', () => {
    it('should translate all texts in parallel', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({ response: { text: () => '안녕하세요' } })
        .mockResolvedValueOnce({ response: { text: () => '세계' } });

      const results = await service.translateBatch(['Hello', 'World'], 'en', 'ko');
      expect(results).toEqual(['안녕하세요', '세계']);
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('should call translate for each text with correct arguments', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({ response: { text: () => '하나' } })
        .mockResolvedValueOnce({ response: { text: () => '둘' } })
        .mockResolvedValueOnce({ response: { text: () => '셋' } });

      const translateSpy = vi.spyOn(service, 'translate');
      await service.translateBatch(['One', 'Two', 'Three'], 'en', 'ko');

      expect(translateSpy).toHaveBeenCalledTimes(3);
      expect(translateSpy).toHaveBeenCalledWith('One', 'en', 'ko');
      expect(translateSpy).toHaveBeenCalledWith('Two', 'en', 'ko');
      expect(translateSpy).toHaveBeenCalledWith('Three', 'en', 'ko');
    });

    it('should return results in the same order as input texts', async () => {
      const translateSpy = vi.spyOn(service, 'translate');
      translateSpy.mockResolvedValueOnce('안녕').mockResolvedValueOnce('세계');

      const result = await service.translateBatch(['hello', 'world'], 'en', 'ko');
      expect(result).toEqual(['안녕', '세계']);
    });

    it('should return empty array for empty input', async () => {
      const results = await service.translateBatch([], 'en', 'ko');
      expect(results).toEqual([]);
    });

    it('should apply glossary substitution when glossaryPath is provided', async () => {
      const glossaryService = new GlossaryService();
      vi.spyOn(glossaryService, 'loadGlossary').mockReturnValue({ Google: 'Google' });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          { provide: GlossaryService, useValue: glossaryService },
          GeminiTranslationService,
        ],
      }).compile();

      const svc = module.get<GeminiTranslationService>(GeminiTranslationService);

      mockGenerateContent.mockImplementationOnce((prompt: string) => {
        // Placeholder should be in the prompt, not "Google"
        expect(prompt).not.toContain('Google');
        return Promise.resolve({
          response: { text: () => '§TERM0§에 오신 것을 환영합니다' },
        });
      });

      const results = await svc.translateBatch(
        ['Welcome to Google'],
        'en',
        'ko',
        { glossaryPath: '/fake/glossary.json' },
      );

      expect(results[0]).toBe('Google에 오신 것을 환영합니다');
    });
  });

  describe('503 overloaded retry', () => {
    it('should retry on 503 error and succeed on next attempt', async () => {
      mockGenerateContent
        .mockRejectedValueOnce(new Error('503 Service Unavailable: overloaded'))
        .mockResolvedValueOnce({ response: { text: () => '안녕하세요' } });

      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕하세요');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('should retry on "overloaded" error message', async () => {
      mockGenerateContent
        .mockRejectedValueOnce(new Error('The model is overloaded'))
        .mockResolvedValueOnce({ response: { text: () => '세계' } });

      const result = await service.translate('World', 'en', 'ko');
      expect(result).toBe('세계');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
  });

  describe('translateBatch concurrency', () => {
    it('should not exceed BATCH_CONCURRENCY=5 simultaneous calls', async () => {
      let maxConcurrent = 0;
      let current = 0;

      const translateSpy = vi.spyOn(service, 'translate').mockImplementation(
        async () => {
          current++;
          maxConcurrent = Math.max(maxConcurrent, current);
          await new Promise((r) => setTimeout(r, 10));
          current--;
          return '번역';
        },
      );

      const texts = Array.from({ length: 10 }, (_, i) => `text${i}`);
      await service.translateBatch(texts, 'en', 'ko');

      expect(translateSpy).toHaveBeenCalledTimes(10);
      expect(maxConcurrent).toBeLessThanOrEqual(5);
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
