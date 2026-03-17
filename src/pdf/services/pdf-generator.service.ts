import { Injectable, NotImplementedException } from '@nestjs/common';
import { IPdfGenerator, PdfGenerateOptions } from '../interfaces';

@Injectable()
export class PdfGeneratorService implements IPdfGenerator {
  async generate(_text: string, _outputPath: string, _options?: PdfGenerateOptions): Promise<void> {
    throw new NotImplementedException('Phase 1');
  }

  async generateFromPages(_pages: string[], _outputPath: string, _options?: PdfGenerateOptions): Promise<void> {
    throw new NotImplementedException('Phase 1');
  }
}
