import { Injectable, BadRequestException } from '@nestjs/common';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';
import { ITranslationService } from '../interfaces/translation-service.interface';
import { MyMemoryTranslationService } from '../services/mymemory-translation.service';

@Injectable()
export class TranslationServiceFactory {
  constructor(private readonly myMemoryService: MyMemoryTranslationService) {}

  getService(provider: TranslationProvider): ITranslationService {
    switch (provider) {
      case TranslationProvider.MYMEMORY:
        return this.myMemoryService;
      case TranslationProvider.GEMINI:
        throw new Error('Gemini provider not implemented — Phase 2');
      default:
        throw new BadRequestException(`Unknown translation provider: ${provider as string}`);
    }
  }
}
