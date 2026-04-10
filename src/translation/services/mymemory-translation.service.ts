import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ITranslationService } from '../interfaces/translation-service.interface';
import { TranslationException } from '../../common/exceptions/translation.exception';
import { GlossaryService } from './glossary.service';
import { postProcessTranslation, splitIntoChunksWithOverlap } from '../utils/translation.utils';
import { mapWithConcurrency } from '../../common/utils/concurrency';

const MYMEMORY_API_URL = 'https://api.mymemory.translated.net/get';
const MAX_CHUNK_SIZE = 500;
const OVERLAP_SENTENCES = 1;
const DAILY_LIMIT_STATUS = 429;
/** Promise.all 무제한 병렬 → rate limit 자기유발 방지 */
const CHUNK_CONCURRENCY = 3;
const BATCH_CONCURRENCY = 3;


const SUPPORTED_LANGUAGES = [
  'af', 'sq', 'am', 'ar', 'hy', 'az', 'eu', 'be', 'bn', 'bs',
  'bg', 'ca', 'ceb', 'zh', 'co', 'hr', 'cs', 'da', 'nl', 'en',
  'eo', 'et', 'fi', 'fr', 'fy', 'gl', 'ka', 'de', 'el', 'gu',
  'ht', 'ha', 'haw', 'he', 'hi', 'hmn', 'hu', 'is', 'ig', 'id',
  'ga', 'it', 'ja', 'jv', 'kn', 'kk', 'km', 'rw', 'ko', 'ku',
  'ky', 'lo', 'la', 'lv', 'lt', 'lb', 'mk', 'mg', 'ms', 'ml',
  'mt', 'mi', 'mr', 'mn', 'my', 'ne', 'no', 'ny', 'or', 'ps',
  'fa', 'pl', 'pt', 'pa', 'ro', 'ru', 'sm', 'gd', 'sr', 'st',
  'sn', 'sd', 'si', 'sk', 'sl', 'so', 'es', 'su', 'sw', 'sv',
  'tl', 'tg', 'ta', 'tt', 'te', 'th', 'tr', 'tk', 'uk', 'ur',
  'ug', 'uz', 'vi', 'cy', 'xh', 'yi', 'yo', 'zu',
];

@Injectable()
export class MyMemoryTranslationService implements ITranslationService {
  private readonly logger = new Logger(MyMemoryTranslationService.name);

  constructor(private readonly glossaryService: GlossaryService) {}

  private async translateChunk(
    chunk: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    const email = process.env.MYMEMORY_EMAIL;
    const params = new URLSearchParams({
      q: chunk,
      langpair: `${sourceLang}|${targetLang}`,
      ...(email ? { de: email } : {}),
    });
    const url = `${MYMEMORY_API_URL}?${params.toString()}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new TranslationException(
        `MyMemory API request failed: ${(error as Error).message}`,
      );
    }

    if (response.status === DAILY_LIMIT_STATUS) {
      this.logger.warn('MyMemory daily translation limit exceeded (5000 characters/day)');
      throw new TranslationException('MyMemory daily translation limit exceeded');
    }

    if (!response.ok) {
      throw new TranslationException(
        `MyMemory API returned status ${response.status}`,
      );
    }

    let data: { responseStatus: number; responseData: { translatedText: string } };
    try {
      data = (await response.json()) as {
        responseStatus: number;
        responseData: { translatedText: string };
      };
    } catch {
      throw new TranslationException('MyMemory API returned invalid JSON response');
    }

    if (data.responseStatus !== 200) {
      if (data.responseStatus === DAILY_LIMIT_STATUS) {
        this.logger.warn('MyMemory daily translation limit exceeded (5000 characters/day)');
        throw new TranslationException('MyMemory daily translation limit exceeded');
      }
      throw new TranslationException(
        `MyMemory API error: status ${data.responseStatus}`,
      );
    }

    return data.responseData.translatedText;
  }

  async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (!text || !text.trim()) {
      throw new BadRequestException('Text to translate cannot be empty');
    }

    const chunks = splitIntoChunksWithOverlap(text, MAX_CHUNK_SIZE, OVERLAP_SENTENCES);
    const translatedChunks = await mapWithConcurrency(
      chunks,
      CHUNK_CONCURRENCY,
      (chunk) => this.translateChunk(chunk, sourceLang, targetLang),
    );

    return postProcessTranslation(translatedChunks.join('\n\n'));
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    options?: { glossaryPath?: string },
  ): Promise<string[]> {
    const terms = options?.glossaryPath
      ? this.glossaryService.loadGlossary(options.glossaryPath)
      : {};
    const hasGlossary =
      options?.glossaryPath && Object.keys(terms).length > 0;

    return mapWithConcurrency(texts, BATCH_CONCURRENCY, async (text) => {
      if (!hasGlossary) {
        return this.translate(text, sourceLang, targetLang);
      }
      const { text: substituted, placeholders } =
        this.glossaryService.substitute(text, terms);
      const translated = await this.translate(substituted, sourceLang, targetLang);
      return this.glossaryService.restore(translated, placeholders);
    });
  }

  async getSupportedLanguages(): Promise<string[]> {
    return Promise.resolve([...SUPPORTED_LANGUAGES]);
  }
}
