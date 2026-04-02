import { Injectable } from '@nestjs/common';
import { ITranslationService } from '../interfaces/translation-service.interface';

@Injectable()
export class MyMemoryTranslationService implements ITranslationService {
  async translate(_text: string, _sourceLang: string, _targetLang: string): Promise<string> {
    throw new Error('Not implemented: Phase 1');
  }

  async translateBatch(_texts: string[], _sourceLang: string, _targetLang: string): Promise<string[]> {
    throw new Error('Not implemented: Phase 1');
  }

  async getSupportedLanguages(): Promise<string[]> {
    throw new Error('Not implemented: Phase 1');
  }
}
