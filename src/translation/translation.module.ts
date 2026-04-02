import { Module } from '@nestjs/common';
import { MyMemoryTranslationService } from './services/mymemory-translation.service';
import { GeminiTranslationService } from './services/gemini-translation.service';
import { TranslationServiceFactory } from './factories/translation-service.factory';

@Module({
  providers: [MyMemoryTranslationService, GeminiTranslationService, TranslationServiceFactory],
  exports: [TranslationServiceFactory],
})
export class TranslationModule {}
