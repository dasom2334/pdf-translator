import { TextBlock } from './text-block.interface';
import { PdfGenerateOptions } from './pdf-overlay-generator.interface';

export const PDF_REBUILD_GENERATOR = Symbol('PDF_REBUILD_GENERATOR');

export interface IPdfRebuildGenerator {
  rebuild(blocks: TextBlock[], outputPath: string, options?: PdfGenerateOptions): Promise<void>;
}
