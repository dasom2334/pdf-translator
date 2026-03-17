import { Module } from '@nestjs/common';
import { PdfExtractorService } from './services/pdf-extractor.service';
import { PdfGeneratorService } from './services/pdf-generator.service';
import { PdfController } from './pdf.controller';
import { PDF_EXTRACTOR, PDF_GENERATOR } from './interfaces';

@Module({
  controllers: [PdfController],
  providers: [
    { provide: PDF_EXTRACTOR, useClass: PdfExtractorService },
    { provide: PDF_GENERATOR, useClass: PdfGeneratorService },
  ],
  exports: [PDF_EXTRACTOR, PDF_GENERATOR],
})
export class PdfModule {}
