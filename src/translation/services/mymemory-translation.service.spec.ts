import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { http, HttpResponse } from 'msw';
import { MyMemoryTranslationService } from './mymemory-translation.service';
import { TranslationException } from '../../common/exceptions/translation.exception';
import { mswServer } from '../../../vitest.setup';

describe('MyMemoryTranslationService', () => {
  let service: MyMemoryTranslationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MyMemoryTranslationService],
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

    it('should split long text into chunks and join results', async () => {
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
      expect(result).toBe('한국어1\n\n한국어2');
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
  });

  describe('translateBatch', () => {
    it('should translate all texts in parallel', async () => {
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

    it('should call translate for each text with correct arguments', async () => {
      let callCount = 0;
      const translations = ['하나', '둘', '셋'];
      mswServer.use(
        http.get('https://api.mymemory.translated.net/get', () => {
          const translated = translations[callCount++] ?? '';
          return HttpResponse.json({
            responseStatus: 200,
            responseData: { translatedText: translated },
          });
        }),
      );

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
