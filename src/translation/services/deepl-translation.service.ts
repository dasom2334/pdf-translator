import {
  Injectable,
  BadRequestException,
  OnModuleInit,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as deepl from 'deepl-node';
import { ITranslationService } from '../interfaces/translation-service.interface';
import { TranslationException } from '../../common/exceptions/translation.exception';

@Injectable()
export class DeepLTranslationService
  implements ITranslationService, OnModuleInit
{
  private translator: deepl.Translator;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('DEEPL_API_KEY');
    if (!apiKey) {
      throw new TranslationException(
        'DEEPL_API_KEY is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    this.translator = new deepl.Translator(apiKey);
  }

  async translate(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    if (!text || text.trim().length === 0) {
      throw new BadRequestException('Text to translate cannot be empty');
    }
    try {
      const result = await this.translator.translateText(
        text,
        sourceLang as deepl.SourceLanguageCode,
        targetLang as deepl.TargetLanguageCode,
      );
      return result.text;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new TranslationException(
        `DeepL translation failed: ${error instanceof Error ? error.message : String(error)}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
  ): Promise<string[]> {
    if (!texts || texts.length === 0) {
      throw new BadRequestException('Texts array cannot be empty');
    }
    try {
      const results = await this.translator.translateText(
        texts,
        sourceLang as deepl.SourceLanguageCode,
        targetLang as deepl.TargetLanguageCode,
      );
      return results.map((r) => r.text);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new TranslationException(
        `DeepL batch translation failed: ${error instanceof Error ? error.message : String(error)}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async getSupportedLanguages(): Promise<string[]> {
    try {
      const languages = await this.translator.getTargetLanguages();
      return languages.map((lang) => lang.code);
    } catch (error) {
      throw new TranslationException(
        `Failed to fetch supported languages: ${error instanceof Error ? error.message : String(error)}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
