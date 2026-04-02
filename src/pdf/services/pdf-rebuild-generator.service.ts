import { Injectable, NotImplementedException } from '@nestjs/common';
import { IPdfRebuildGenerator, PdfGenerateOptions, TextBlock } from '../interfaces';

@Injectable()
export class PdfRebuildGeneratorService implements IPdfRebuildGenerator {
  async rebuild(
    _blocks: TextBlock[],
    _outputPath: string,
    _options?: PdfGenerateOptions,
  ): Promise<void> {
    throw new NotImplementedException('Phase 1');
  }
}
