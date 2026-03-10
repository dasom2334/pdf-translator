import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DeepLTranslationService } from './services/deepl-translation.service';
import { GoogleTranslationService } from './services/google-translation.service';
import { LlmTranslationService } from './services/llm-translation.service';
import { TranslationServiceFactory } from './factories/translation-service.factory';

@Module({
  imports: [ConfigModule],
  providers: [
    DeepLTranslationService,
    GoogleTranslationService,
    LlmTranslationService,
    TranslationServiceFactory,
  ],
  exports: [
    TranslationServiceFactory,
    DeepLTranslationService,
    GoogleTranslationService,
    LlmTranslationService,
  ],
})
export class TranslationModule {}
