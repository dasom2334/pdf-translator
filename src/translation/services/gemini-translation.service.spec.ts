import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { GeminiTranslationService } from './gemini-translation.service';
import { GlossaryService } from './glossary.service';
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
      providers: [GlossaryService, GeminiTranslationService],
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
        providers: [GlossaryService, GeminiTranslationService],
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

    it('should strip HTML tags from translation result (T-3 post-processing)', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => '<b>안녕하세요</b>' },
      });
      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕하세요');
    });

    it('should collapse extra whitespace in translation result (T-3 post-processing)', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => '안녕  하세요' },
      });
      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕 하세요');
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

    it('should apply glossary substitution when glossaryPath is provided (T-4)', async () => {
      const glossaryService = new GlossaryService();
      vi.spyOn(glossaryService, 'loadGlossary').mockReturnValue({ Google: 'Google' });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          { provide: GlossaryService, useValue: glossaryService },
          GeminiTranslationService,
        ],
      }).compile();

      const svc = module.get<GeminiTranslationService>(GeminiTranslationService);
      svc.onModuleInit();

      const aiInstance = (GoogleGenerativeAI as ReturnType<typeof vi.fn>).mock.results[
        (GoogleGenerativeAI as ReturnType<typeof vi.fn>).mock.results.length - 1
      ].value as { getGenerativeModel: ReturnType<typeof vi.fn> };
      const model = aiInstance.getGenerativeModel({ model: 'gemini-1.5-flash' }) as {
        generateContent: ReturnType<typeof vi.fn>;
      };

      model.generateContent.mockImplementationOnce((prompt: string) => {
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
