import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MyMemoryTranslationService } from './services/mymemory-translation.service';
import { GeminiTranslationService } from './services/gemini-translation.service';
import { TranslationServiceFactory } from './factories/translation-service.factory';

@Module({
  imports: [ConfigModule],
  providers: [
    MyMemoryTranslationService,
    GeminiTranslationService,
    TranslationServiceFactory,
  ],
  exports: [
    MyMemoryTranslationService,
    GeminiTranslationService,
    TranslationServiceFactory,
  ],
})
export class TranslationModule {}
