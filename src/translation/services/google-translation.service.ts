import { Injectable } from '@nestjs/common';
import { ITranslationService } from '../interfaces/translation-service.interface';

@Injectable()
export class GoogleTranslationService implements ITranslationService {
  translate(
    _text: string,
    _sourceLang: string,
    _targetLang: string,
  ): Promise<string> {
    throw new Error('Not implemented');
  }

  translateBatch(
    _texts: string[],
    _sourceLang: string,
    _targetLang: string,
  ): Promise<string[]> {
    throw new Error('Not implemented');
  }

  getSupportedLanguages(): Promise<string[]> {
    throw new Error('Not implemented');
  }
}
