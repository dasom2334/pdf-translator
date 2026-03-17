import { Injectable, NotImplementedException } from '@nestjs/common';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';
import { ITranslationService } from '../interfaces/translation-service.interface';

@Injectable()
export class TranslationServiceFactory {
  create(_provider: TranslationProvider): ITranslationService {
    throw new NotImplementedException('Phase 1');
  }
}
