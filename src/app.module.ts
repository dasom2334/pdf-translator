import { Module } from '@nestjs/common';
import { PdfModule } from './pdf/pdf.module';
import { TranslationModule } from './translation/translation.module';

@Module({
  imports: [PdfModule, TranslationModule],
})
export class AppModule {}
