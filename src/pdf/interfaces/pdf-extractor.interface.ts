export const PDF_EXTRACTOR = Symbol('PDF_EXTRACTOR');

export interface IPdfExtractor {
  extractText(fileBuffer: Buffer): Promise<string>;
  extractTextByPages(fileBuffer: Buffer, pageRange?: string): Promise<string[]>;
}
