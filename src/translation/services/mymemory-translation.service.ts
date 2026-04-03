import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ITranslationService } from '../interfaces/translation-service.interface';
import { TranslationException } from '../../common/exceptions/translation.exception';

const MYMEMORY_API_URL = 'https://api.mymemory.translated.net/get';
const MAX_CHUNK_SIZE = 500;
const DAILY_LIMIT_STATUS = 429;

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

  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    // Split by paragraph boundaries first
    const paragraphs = text.split(/\n\n+/);

    let currentChunk = '';
    for (const paragraph of paragraphs) {
      if (paragraph.length > MAX_CHUNK_SIZE) {
        // If current chunk is non-empty, save it first
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        // Split long paragraph by sentences
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
          if ((currentChunk + ' ' + sentence).trim().length > MAX_CHUNK_SIZE) {
            if (currentChunk.trim()) {
              chunks.push(currentChunk.trim());
              currentChunk = sentence;
            } else {
              // Single sentence exceeds limit, push as-is
              chunks.push(sentence.slice(0, MAX_CHUNK_SIZE));
              currentChunk = '';
            }
          } else {
            currentChunk = (currentChunk + ' ' + sentence).trim();
          }
        }
      } else if ((currentChunk + '\n\n' + paragraph).trim().length > MAX_CHUNK_SIZE) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = paragraph;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }

  private async translateChunk(
    chunk: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    const params = new URLSearchParams({
      q: chunk,
      langpair: `${sourceLang}|${targetLang}`,
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

    const chunks = this.splitIntoChunks(text);
    const translatedChunks = await Promise.all(
      chunks.map((chunk) => this.translateChunk(chunk, sourceLang, targetLang)),
    );

    return translatedChunks.join('\n\n');
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
  ): Promise<string[]> {
    return Promise.all(texts.map((text) => this.translate(text, sourceLang, targetLang)));
  }

  async getSupportedLanguages(): Promise<string[]> {
    return Promise.resolve([...SUPPORTED_LANGUAGES]);
  }
}
