import { Injectable, NotImplementedException } from '@nestjs/common';
import { IPdfExtractor, TextBlock } from '../interfaces';

@Injectable()
export class PdfExtractorService implements IPdfExtractor {
  async extractBlocks(_fileBuffer: Buffer): Promise<TextBlock[]> {
    throw new NotImplementedException('Phase 1');
  }

  async extractBlocksByPages(_fileBuffer: Buffer, _pageRange?: string): Promise<TextBlock[][]> {
    throw new NotImplementedException('Phase 1');
  }
}
