import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MyMemoryTranslationService } from './mymemory-translation.service';
import { TranslationException } from '../../common/exceptions/translation.exception';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MyMemoryTranslationService', () => {
  let service: MyMemoryTranslationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MyMemoryTranslationService],
    }).compile();
    service = moduleRef.get(MyMemoryTranslationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('translate', () => {
    it('should translate text successfully', async () => {
      mockedAxios.get = jest.fn().mockResolvedValue({
        data: { responseStatus: 200, responseData: { translatedText: '안녕하세요' } },
      });
      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕하세요');
    });

    it('should throw BadRequestException for empty text', async () => {
      await expect(service.translate('', 'en', 'ko')).rejects.toThrow(BadRequestException);
    });

    it('should throw TranslationException on API error', async () => {
      mockedAxios.get = jest.fn().mockResolvedValue({
        data: { responseStatus: 403, responseDetails: 'Quota exceeded' },
      });
      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
    });

    it('should throw TranslationException on network error', async () => {
      mockedAxios.get = jest.fn().mockRejectedValue(new Error('Network error'));
      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
    });
  });

  describe('translateBatch', () => {
    it('should translate multiple texts', async () => {
      mockedAxios.get = jest.fn().mockResolvedValue({
        data: { responseStatus: 200, responseData: { translatedText: '번역됨' } },
      });
      const result = await service.translateBatch(['Hello', 'World'], 'en', 'ko');
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('번역됨');
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return list of supported languages', async () => {
      const langs = await service.getSupportedLanguages();
      expect(Array.isArray(langs)).toBe(true);
      expect(langs).toContain('en');
      expect(langs).toContain('ko');
    });
  });
});
