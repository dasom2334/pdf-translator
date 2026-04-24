import { BadRequestException, Injectable } from '@nestjs/common';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';
import { ITranslationService } from '../interfaces/translation-service.interface';
import { MyMemoryTranslationService } from '../services/mymemory-translation.service';
import { GeminiTranslationService } from '../services/gemini-translation.service';
import { LocalLlmTranslationService } from '../services/local-llm-translation.service';

@Injectable()
export class TranslationServiceFactory {
  constructor(
    private readonly myMemoryService: MyMemoryTranslationService,
    private readonly geminiService: GeminiTranslationService,
    private readonly localLlmService: LocalLlmTranslationService,
  ) {}

  getService(provider: TranslationProvider): ITranslationService {
    switch (provider) {
      case TranslationProvider.MYMEMORY:
        return this.myMemoryService;
      case TranslationProvider.GEMINI:
        return this.geminiService;
      case TranslationProvider.LOCAL:
        return this.localLlmService;
      default:
        throw new BadRequestException(`Unsupported translation provider: ${provider as string}`);
    }
  }
}
