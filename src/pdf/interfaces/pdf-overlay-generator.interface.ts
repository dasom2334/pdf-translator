import { TextBlock } from './text-block.interface';

export const PDF_OVERLAY_GENERATOR = Symbol('PDF_OVERLAY_GENERATOR');

export interface PdfGenerateOptions {
  fontPath?: string;
}

export interface IPdfOverlayGenerator {
  overlay(
    originalBuffer: Buffer,
    blocks: TextBlock[],
    outputPath: string,
    options?: PdfGenerateOptions,
  ): Promise<void>;
}
