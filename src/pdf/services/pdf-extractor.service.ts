import { Injectable, NotImplementedException } from '@nestjs/common';
import { IPdfExtractor } from '../interfaces';

@Injectable()
export class PdfExtractorService implements IPdfExtractor {
  async extractText(_fileBuffer: Buffer): Promise<string> {
    throw new NotImplementedException('Phase 1');
  }

  async extractTextByPages(_fileBuffer: Buffer): Promise<string[]> {
    throw new NotImplementedException('Phase 1');
  }
}
