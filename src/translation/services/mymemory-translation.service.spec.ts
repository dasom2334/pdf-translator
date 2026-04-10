import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { http, HttpResponse } from 'msw';
import { MyMemoryTranslationService } from './mymemory-translation.service';
import { GlossaryService } from './glossary.service';
import { TranslationException } from '../../common/exceptions/translation.exception';
import { mswServer } from '../../../vitest.setup';

describe('MyMemoryTranslationService', () => {
  let service: MyMemoryTranslationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GlossaryService, MyMemoryTranslationService],
    }).compile();

    service = module.get<MyMemoryTranslationService>(MyMemoryTranslationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('translate', () => {
    it('should translate text successfully', async () => {
      mswServer.use(
        http.get('https://api.mymemory.translated.net/get', () =>
          HttpResponse.json({
            responseStatus: 200,
            responseData: { translatedText: '안녕하세요' },
          }),
        ),
      );

      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕하세요');
    });

    it('should throw BadRequestException for empty text', async () => {
      await expect(service.translate('', 'en', 'ko')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for whitespace-only text', async () => {
      await expect(service.translate('   ', 'en', 'ko')).rejects.toThrow(BadRequestException);
    });

    it('should throw TranslationException when API returns non-ok response', async () => {
      mswServer.use(
        http.get('https://api.mymemory.translated.net/get', () =>
          HttpResponse.json({}, { status: 500 }),
        ),
      );
      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
    });

    it('should throw TranslationException on fetch network error', async () => {
      mswServer.use(
        http.get('https://api.mymemory.translated.net/get', () => HttpResponse.error()),
      );
      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
    });

    it('should warn and throw TranslationException when daily limit exceeded (HTTP 429)', async () => {
      mswServer.use(
        http.get('https://api.mymemory.translated.net/get', () =>
          HttpResponse.json({}, { status: 429 }),
        ),
      );
      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
    });

    it('should warn and throw TranslationException when responseStatus is 429', async () => {
      mswServer.use(
        http.get('https://api.mymemory.translated.net/get', () =>
          HttpResponse.json({
            responseStatus: 429,
            responseData: { translatedText: '' },
          }),
        ),
      );
      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
    });

    it('should split long text into chunks and translate each', async () => {
      // Two paragraphs each 300 chars -> split into separate chunks
      const longParagraph1 = 'A'.repeat(300);
      const longParagraph2 = 'B'.repeat(300);
      const longText = `${longParagraph1}\n\n${longParagraph2}`;

      let callCount = 0;
      mswServer.use(
        http.get('https://api.mymemory.translated.net/get', () => {
          callCount++;
          return HttpResponse.json({
            responseStatus: 200,
            responseData: { translatedText: callCount === 1 ? '한국어1' : '한국어2' },
          });
        }),
      );

      const result = await service.translate(longText, 'en', 'ko');
      // Chunks are split and joined; post-processing normalises whitespace
      expect(result).toContain('한국어1');
      expect(result).toContain('한국어2');
      expect(callCount).toBe(2);
    });

    it('should include langpair in request URL', async () => {
      let capturedUrl = '';
      mswServer.use(
        http.get('https://api.mymemory.translated.net/get', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({
            responseStatus: 200,
            responseData: { translatedText: 'Hola' },
          });
        }),
      );

      await service.translate('Hello', 'en', 'es');
      expect(capturedUrl).toContain('langpair=en%7Ces');
    });

    it('should strip HTML tags from translation result', async () => {
      mswServer.use(
        http.get('https://api.mymemory.translated.net/get', () =>
          HttpResponse.json({
            responseStatus: 200,
            responseData: { translatedText: '<b>안녕하세요</b>' },
          }),
        ),
      );
      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕하세요');
    });

    it('should collapse extra whitespace in translation result', async () => {
      mswServer.use(
        http.get('https://api.mymemory.translated.net/get', () =>
          HttpResponse.json({
            responseStatus: 200,
            responseData: { translatedText: '안녕  하세요' },
          }),
        ),
      );
      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕 하세요');
    });
  });

  describe('translateBatch', () => {
    it('should translate all texts sequentially', async () => {
      let callCount = 0;
      mswServer.use(
        http.get('https://api.mymemory.translated.net/get', () => {
          callCount++;
          return HttpResponse.json({
            responseStatus: 200,
            responseData: { translatedText: callCount === 1 ? '안녕하세요' : '세계' },
          });
        }),
      );

      const results = await service.translateBatch(['Hello', 'World'], 'en', 'ko');
      expect(results).toEqual(['안녕하세요', '세계']);
      expect(callCount).toBe(2);
    });

    it('should return empty array for empty input', async () => {
      const results = await service.translateBatch([], 'en', 'ko');
      expect(results).toEqual([]);
    });

    it('should apply glossary substitution when glossaryPath is provided', async () => {
      // Mock the glossary service to return a known term map
      const glossaryService = new GlossaryService();
      vi.spyOn(glossaryService, 'loadGlossary').mockReturnValue({ Google: 'Google' });

      // GlossaryService.substitute를 spy하여 실제 placeholder 캡처
      let capturedPlaceholder: string;
      vi.spyOn(glossaryService, 'substitute').mockImplementation((text, terms) => {
        capturedPlaceholder = `\x00GTERM_test-uuid\x00`;
        const placeholders = new Map([[capturedPlaceholder, (terms as Record<string, string>)['Google']]]);
        return { text: text.replace('Google', capturedPlaceholder), placeholders };
      });
      vi.spyOn(glossaryService, 'restore').mockImplementation((text, placeholders) => {
        let result = text;
        for (const [ph, original] of placeholders.entries()) {
          result = result.replace(ph, original);
        }
        return result;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          { provide: GlossaryService, useValue: glossaryService },
          MyMemoryTranslationService,
        ],
      }).compile();

      const svc = module.get<MyMemoryTranslationService>(MyMemoryTranslationService);

      mswServer.use(
        http.get('https://api.mymemory.translated.net/get', ({ request }) => {
          const url = new URL(request.url);
          const q = url.searchParams.get('q') ?? '';
          // Placeholder should be present in the request, not "Google"
          expect(q).not.toContain('Google');
          return HttpResponse.json({
            responseStatus: 200,
            responseData: { translatedText: `${capturedPlaceholder}에 오신 것을 환영합니다` },
          });
        }),
      );

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
