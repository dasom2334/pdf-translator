import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { ITranslationService } from '../interfaces/translation-service.interface';
import { TranslationException } from '../../common/exceptions/translation.exception';

export interface GlossaryEntry {
  source: string;
  target: string;
}

const SUPPORTED_LANGUAGES = [
  'en', 'ko', 'ja', 'zh', 'fr', 'de', 'es', 'it', 'pt', 'ru',
  'ar', 'nl', 'pl', 'sv', 'da', 'fi', 'no', 'tr', 'vi', 'th',
  'hi', 'id', 'ms', 'cs', 'sk', 'hu', 'ro', 'bg', 'uk', 'el',
];

@Injectable()
export class GeminiTranslationService implements ITranslationService, OnModuleInit {
  private model!: GenerativeModel;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async translate(
    text: string,
    sourceLang: string,
    targetLang: string,
    glossary?: GlossaryEntry[],
  ): Promise<string> {
    if (!text || text.trim().length === 0) {
      throw new BadRequestException('Text to translate cannot be empty');
    }

    const prompt = this.buildPrompt(text, sourceLang, targetLang, glossary);

    try {
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const translated = response.text().trim();
      return translated;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new TranslationException(
        `Gemini translation failed: ${(err as Error).message}`,
      );
    }
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    glossary?: GlossaryEntry[],
  ): Promise<string[]> {
    const results: string[] = [];
    for (const text of texts) {
      const translated = await this.translate(text, sourceLang, targetLang, glossary);
      results.push(translated);
    }
    return results;
  }

  async getSupportedLanguages(): Promise<string[]> {
    return SUPPORTED_LANGUAGES;
  }

  private buildPrompt(
    text: string,
    sourceLang: string,
    targetLang: string,
    glossary?: GlossaryEntry[],
  ): string {
    let prompt = `Translate the following text from ${sourceLang} to ${targetLang}. Return only the translated text without any explanations or additional content.\n\n`;

    if (glossary && glossary.length > 0) {
      prompt += 'Use the following glossary for specific term translations:\n';
      for (const entry of glossary) {
        prompt += `- "${entry.source}" → "${entry.target}"\n`;
      }
      prompt += '\n';
    }

    prompt += `Text to translate:\n${text}`;

    return prompt;
  }
}
