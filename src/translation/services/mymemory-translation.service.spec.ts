import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MyMemoryTranslationService } from './mymemory-translation.service';
import { GlossaryService } from './glossary.service';
import { TranslationException } from '../../common/exceptions/translation.exception';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeMyMemoryResponse(translatedText: string, responseStatus = 200) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      responseStatus,
      responseData: { translatedText },
    }),
  } as unknown as Response;
}

describe('MyMemoryTranslationService', () => {
  let service: MyMemoryTranslationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GlossaryService, MyMemoryTranslationService],
    }).compile();

    service = module.get<MyMemoryTranslationService>(MyMemoryTranslationService);
    mockFetch.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('translate', () => {
    it('should translate text successfully', async () => {
      mockFetch.mockResolvedValueOnce(makeMyMemoryResponse('안녕하세요'));
      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕하세요');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.mymemory.translated.net'),
      );
    });

    it('should throw BadRequestException for empty text', async () => {
      await expect(service.translate('', 'en', 'ko')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for whitespace-only text', async () => {
      await expect(service.translate('   ', 'en', 'ko')).rejects.toThrow(BadRequestException);
    });

    it('should throw TranslationException when API returns non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as unknown as Response);
      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
    });

    it('should throw TranslationException on fetch network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
    });

    it('should warn and throw TranslationException when daily limit exceeded (HTTP 429)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({}),
      } as unknown as Response);
      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
    });

    it('should warn and throw TranslationException when responseStatus is 429', async () => {
      mockFetch.mockResolvedValueOnce(makeMyMemoryResponse('', 429));
      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
    });

    it('should split long text into chunks and translate each', async () => {
      // Two paragraphs each 300 chars -> split into separate chunks
      const longParagraph1 = 'A'.repeat(300);
      const longParagraph2 = 'B'.repeat(300);
      const longText = `${longParagraph1}\n\n${longParagraph2}`;

      mockFetch
        .mockResolvedValueOnce(makeMyMemoryResponse('한국어1'))
        .mockResolvedValueOnce(makeMyMemoryResponse('한국어2'));

      const result = await service.translate(longText, 'en', 'ko');
      // Chunks are split and joined; post-processing normalises whitespace
      expect(result).toContain('한국어1');
      expect(result).toContain('한국어2');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should include langpair in request URL', async () => {
      mockFetch.mockResolvedValueOnce(makeMyMemoryResponse('Hola'));
      await service.translate('Hello', 'en', 'es');
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('langpair=en%7Ces'));
    });

    it('should strip HTML tags from translation result (T-3 post-processing)', async () => {
      mockFetch.mockResolvedValueOnce(makeMyMemoryResponse('<b>안녕하세요</b>'));
      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕하세요');
    });

    it('should collapse extra whitespace in translation result (T-3 post-processing)', async () => {
      mockFetch.mockResolvedValueOnce(makeMyMemoryResponse('안녕  하세요'));
      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕 하세요');
    });
  });

  describe('translateBatch', () => {
    it('should translate all texts sequentially', async () => {
      mockFetch
        .mockResolvedValueOnce(makeMyMemoryResponse('안녕하세요'))
        .mockResolvedValueOnce(makeMyMemoryResponse('세계'));

      const results = await service.translateBatch(['Hello', 'World'], 'en', 'ko');
      expect(results).toEqual(['안녕하세요', '세계']);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return empty array for empty input', async () => {
      const results = await service.translateBatch([], 'en', 'ko');
      expect(results).toEqual([]);
    });

    it('should apply glossary substitution when glossaryPath is provided (T-4)', async () => {
      // Mock the glossary service to return a known term map
      const glossaryService = new GlossaryService();
      vi.spyOn(glossaryService, 'loadGlossary').mockReturnValue({ Google: 'Google' });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          { provide: GlossaryService, useValue: glossaryService },
          MyMemoryTranslationService,
        ],
      }).compile();

      const svc = module.get<MyMemoryTranslationService>(MyMemoryTranslationService);

      // The word "Google" gets replaced by placeholder before API call,
      // then restored after. The API should receive a placeholder.
      mockFetch.mockImplementationOnce((url: string) => {
        // Placeholder should be present in the request, not "Google"
        expect(url).not.toContain('Google');
        return Promise.resolve(makeMyMemoryResponse('§TERM0§에 오신 것을 환영합니다'));
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
