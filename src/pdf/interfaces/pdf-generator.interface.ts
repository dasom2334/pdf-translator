export const PDF_GENERATOR = Symbol('PDF_GENERATOR');

export interface PdfGenerateOptions {
  fontPath?: string;
  glossary?: Record<string, string>;
}

export interface IPdfGenerator {
  generate(text: string, outputPath: string, options?: PdfGenerateOptions): Promise<void>;
  generateFromPages(pages: string[], outputPath: string, options?: PdfGenerateOptions): Promise<void>;
  generateBilingual(
    originalPages: string[],
    translatedPages: string[],
    outputPath: string,
    options?: PdfGenerateOptions,
  ): Promise<void>;
}
