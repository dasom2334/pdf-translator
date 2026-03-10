import { Injectable } from '@nestjs/common';
import { ITranslationService } from '../interfaces/translation-service.interface';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';

@Injectable()
export class TranslationServiceFactory {
  getService(_provider: TranslationProvider): ITranslationService {
    throw new Error('Not implemented');
  }
}
