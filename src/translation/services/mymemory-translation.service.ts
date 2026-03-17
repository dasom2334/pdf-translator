import { Injectable, BadRequestException } from '@nestjs/common';
import { TranslationException } from '../../common/exceptions/translation.exception';
import { ITranslationService } from '../interfaces/translation-service.interface';
import axios from 'axios';

const MYMEMORY_API_URL = 'https://api.mymemory.translated.net/get';

interface MyMemoryResponse {
  responseStatus: number;
  responseData: {
    translatedText: string;
  };
  responseDetails?: string;
}

@Injectable()
export class MyMemoryTranslationService implements ITranslationService {
  async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (!text || text.trim().length === 0) {
      throw new BadRequestException('Text to translate cannot be empty');
    }
    try {
      const response = await axios.get<MyMemoryResponse>(MYMEMORY_API_URL, {
        params: { q: text, langpair: `${sourceLang}|${targetLang}` },
      });
      if (response.data.responseStatus !== 200) {
        throw new TranslationException(
          `MyMemory API error: ${response.data.responseDetails ?? 'Unknown error'}`,
        );
      }
      return response.data.responseData.translatedText;
    } catch (err) {
      if (err instanceof TranslationException || err instanceof BadRequestException) throw err;
      throw new TranslationException(`MyMemory request failed: ${(err as Error).message}`);
    }
  }

  async translateBatch(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
    const results: string[] = [];
    for (const text of texts) {
      const translated = await this.translate(text, sourceLang, targetLang);
      results.push(translated);
    }
    return results;
  }

  async getSupportedLanguages(): Promise<string[]> {
    return [
      'en', 'ko', 'ja', 'zh', 'fr', 'de', 'es', 'it', 'pt', 'ru',
      'ar', 'nl', 'pl', 'sv', 'da', 'fi', 'no', 'tr', 'vi', 'th',
    ];
  }
}
