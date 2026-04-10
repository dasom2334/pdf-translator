import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { ITranslationService } from '../interfaces/translation-service.interface';
import { TranslationException } from '../../common/exceptions/translation.exception';
import { GlossaryService } from './glossary.service';
import { postProcessTranslation, splitIntoChunksWithOverlap } from '../utils/translation.utils';

const MAX_CHUNK_SIZE = 4000;
const OVERLAP_SENTENCES = 1;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

const SUPPORTED_LANGUAGES = [
  'af', 'sq', 'am', 'ar', 'hy', 'az', 'eu', 'be', 'bn', 'bs',
  'bg', 'ca', 'zh', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi',
  'fr', 'gl', 'ka', 'de', 'el', 'gu', 'ht', 'ha', 'he', 'hi',
  'hu', 'is', 'ig', 'id', 'ga', 'it', 'ja', 'kn', 'kk', 'km',
  'ko', 'ky', 'lo', 'lv', 'lt', 'mk', 'ms', 'ml', 'mt', 'mr',
  'mn', 'my', 'ne', 'no', 'fa', 'pl', 'pt', 'pa', 'ro', 'ru',
  'sr', 'sk', 'sl', 'es', 'sw', 'sv', 'tl', 'ta', 'te', 'th',
  'tr', 'uk', 'ur', 'uz', 'vi', 'cy', 'yo', 'zu',
];

@Injectable()
export class GeminiTranslationService implements ITranslationService {
  private readonly logger = new Logger(GeminiTranslationService.name);
  private model: GenerativeModel | null = null;

  constructor(private readonly glossaryService: GlossaryService) {}

  private getModel(): GenerativeModel {
    if (!this.model) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new TranslationException(
          'GEMINI_API_KEY environment variable is required for Gemini translation',
        );
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    }
    return this.model;
  }

  private buildPrompt(text: string, sourceLang: string, targetLang: string): string {
    return (
      `Translate the following text from ${sourceLang} to ${targetLang}.\n` +
      `Return ONLY the translated text without any explanations, notes, or formatting markers.\n\n` +
      `Text to translate:\n${text}`
    );
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRateLimitError(error: unknown): boolean {
    const message = (error as Error)?.message ?? '';
    return (
      message.includes('429') ||
      message.toLowerCase().includes('rate limit') ||
      message.toLowerCase().includes('quota')
    );
  }

  private async translateChunkWithRetry(
    chunk: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    const prompt = this.buildPrompt(chunk, sourceLang, targetLang);
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await this.getModel().generateContent(prompt);
        const response = result.response;
        const translated = response.text().trim();
        return translated;
      } catch (error) {
        lastError = error;
        if (this.isRateLimitError(error)) {
          const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
          this.logger.warn(
            `Gemini rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await this.sleep(delay);
        } else {
          // Non-rate-limit error, don't retry
          break;
        }
      }
    }

    throw new TranslationException(
      `Gemini translation failed: ${(lastError as Error)?.message ?? 'Unknown error'}`,
    );
  }

  async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (!text || !text.trim()) {
      throw new BadRequestException('Text to translate cannot be empty');
    }

    const chunks = splitIntoChunksWithOverlap(text, MAX_CHUNK_SIZE, OVERLAP_SENTENCES);
    const translatedChunks: string[] = [];

    for (const chunk of chunks) {
      const translated = await this.translateChunkWithRetry(chunk, sourceLang, targetLang);
      translatedChunks.push(translated);
    }

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

    const results: string[] = [];
    for (const text of texts) {
      if (!options?.glossaryPath || Object.keys(terms).length === 0) {
        const translated = await this.translate(text, sourceLang, targetLang);
        results.push(translated);
      } else {
        const { text: substituted, placeholders } = this.glossaryService.substitute(text, terms);
        const translated = await this.translate(substituted, sourceLang, targetLang);
        results.push(this.glossaryService.restore(translated, placeholders));
      }
    }
    return results;
  }

  async getSupportedLanguages(): Promise<string[]> {
    return Promise.resolve([...SUPPORTED_LANGUAGES]);
  }
}
