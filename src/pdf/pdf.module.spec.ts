import { Test } from '@nestjs/testing';
import { PdfModule } from './pdf.module';
import { PDF_EXTRACTOR, PDF_OVERLAY_GENERATOR, PDF_REBUILD_GENERATOR } from './interfaces';

describe('PdfModule', () => {
  it('should resolve PDF_EXTRACTOR', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PdfModule],
    }).compile();
    const extractor = moduleRef.get(PDF_EXTRACTOR);
    expect(extractor).toBeDefined();
  });

  it('should resolve PDF_OVERLAY_GENERATOR', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PdfModule],
    }).compile();
    const overlayGenerator = moduleRef.get(PDF_OVERLAY_GENERATOR);
    expect(overlayGenerator).toBeDefined();
  });

  it('should resolve PDF_REBUILD_GENERATOR', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PdfModule],
    }).compile();
    const rebuildGenerator = moduleRef.get(PDF_REBUILD_GENERATOR);
    expect(rebuildGenerator).toBeDefined();
  });
});
