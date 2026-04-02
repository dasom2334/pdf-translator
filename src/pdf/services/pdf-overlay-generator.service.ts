import { Injectable } from '@nestjs/common';
import { IPdfOverlayGenerator, PdfGenerateOptions, TextBlock } from '../interfaces';

@Injectable()
export class PdfOverlayGeneratorService implements IPdfOverlayGenerator {
  async overlay(
    _originalBuffer: Buffer,
    _blocks: TextBlock[],
    _outputPath: string,
    _options?: PdfGenerateOptions,
  ): Promise<void> {
    throw new Error('Not implemented: Phase 1');
  }
}
