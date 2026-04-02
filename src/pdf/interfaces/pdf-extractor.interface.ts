import { TextBlock } from './text-block.interface';

export const PDF_EXTRACTOR = Symbol('PDF_EXTRACTOR');

export interface IPdfExtractor {
  extractBlocks(fileBuffer: Buffer): Promise<TextBlock[]>;
  extractBlocksByPages(fileBuffer: Buffer, pageRange?: string): Promise<TextBlock[][]>;
}
