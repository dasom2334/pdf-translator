import { Module } from '@nestjs/common';
import { PdfExtractorService } from './services/pdf-extractor.service';
import { PdfOverlayGeneratorService } from './services/pdf-overlay-generator.service';
import { PdfRebuildGeneratorService } from './services/pdf-rebuild-generator.service';
import { PdfController } from './pdf.controller';
import { PDF_EXTRACTOR, PDF_OVERLAY_GENERATOR, PDF_REBUILD_GENERATOR } from './interfaces';

@Module({
  controllers: [PdfController],
  providers: [
    PdfExtractorService,
    PdfOverlayGeneratorService,
    PdfRebuildGeneratorService,
    { provide: PDF_EXTRACTOR, useExisting: PdfExtractorService },
    { provide: PDF_OVERLAY_GENERATOR, useExisting: PdfOverlayGeneratorService },
    { provide: PDF_REBUILD_GENERATOR, useExisting: PdfRebuildGeneratorService },
  ],
  exports: [PDF_EXTRACTOR, PDF_OVERLAY_GENERATOR, PDF_REBUILD_GENERATOR],
})
export class PdfModule {}
