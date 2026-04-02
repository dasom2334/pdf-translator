import { Injectable } from '@nestjs/common';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';
import { ITranslationService } from '../interfaces/translation-service.interface';

@Injectable()
export class TranslationServiceFactory {
  create(_provider: TranslationProvider): ITranslationService {
    throw new Error('Not implemented: Phase 1');
  }
}
