import { Module } from '@nestjs/common';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';
import { TranslationModule } from '../translation/translation.module';

@Module({
  imports: [TranslationModule],
  controllers: [PdfController],
  providers: [PdfService],
})
export class PdfModule {}
