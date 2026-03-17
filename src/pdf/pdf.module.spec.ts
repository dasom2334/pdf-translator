import { Test } from '@nestjs/testing';
import { PdfModule } from './pdf.module';
import { PDF_EXTRACTOR, PDF_GENERATOR } from './interfaces';

describe('PdfModule', () => {
  it('should resolve PDF_EXTRACTOR', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PdfModule],
    }).compile();
    const extractor = moduleRef.get(PDF_EXTRACTOR);
    expect(extractor).toBeDefined();
  });

  it('should resolve PDF_GENERATOR', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PdfModule],
    }).compile();
    const generator = moduleRef.get(PDF_GENERATOR);
    expect(generator).toBeDefined();
  });
});
