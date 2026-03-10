import { Injectable, BadRequestException } from '@nestjs/common';
import { ITranslationService } from '../interfaces/translation-service.interface';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';
import { DeepLTranslationService } from '../services/deepl-translation.service';
import { GoogleTranslationService } from '../services/google-translation.service';
import { LlmTranslationService } from '../services/llm-translation.service';

@Injectable()
export class TranslationServiceFactory {
  constructor(
    private readonly deeplService: DeepLTranslationService,
    private readonly googleService: GoogleTranslationService,
    private readonly llmService: LlmTranslationService,
  ) {}

  getService(provider: TranslationProvider): ITranslationService {
    switch (provider) {
      case TranslationProvider.DEEPL:
        return this.deeplService;
      case TranslationProvider.GOOGLE:
        return this.googleService;
      case TranslationProvider.LLM:
        return this.llmService;
      default:
        throw new BadRequestException(
          `Unsupported translation provider: ${String(provider)}`,
        );
    }
  }
}
