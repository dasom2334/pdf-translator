import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { ITranslationService } from '../interfaces/translation-service.interface';
import { TranslationException } from '../../common/exceptions/translation.exception';

const MAX_CHUNK_SIZE = 4000;
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
export class GeminiTranslationService implements ITranslationService, OnModuleInit {
  private readonly logger = new Logger(GeminiTranslationService.name);
  private model!: GenerativeModel;

  onModuleInit(): void {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY environment variable is required for GeminiTranslationService',
      );
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  private splitIntoChunks(text: string): string[] {
    if (text.length <= MAX_CHUNK_SIZE) {
      return [text];
    }

    const chunks: string[] = [];
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if (paragraph.length > MAX_CHUNK_SIZE) {
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
        const result = await this.model.generateContent(prompt);
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

    const chunks = this.splitIntoChunks(text);
    const translatedChunks: string[] = [];

    for (const chunk of chunks) {
      const translated = await this.translateChunkWithRetry(chunk, sourceLang, targetLang);
      translatedChunks.push(translated);
    }

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
