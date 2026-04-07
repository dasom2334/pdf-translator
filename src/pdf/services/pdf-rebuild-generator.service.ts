import * as fs from 'fs';
import * as path from 'path';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { IPdfRebuildGenerator, PdfGenerateOptions, TextBlock } from '../interfaces';

const MIN_FONT_SIZE = 4;
const ELLIPSIS = '...';

/**
 * Default bundled font path (Noto Sans CJK KR).
 * Falls back to a standard font if the file doesn't exist.
 */
const DEFAULT_FONT_PATH = path.resolve(
  __dirname,
  '../../../../assets/fonts/NotoSansCJKkr-Regular.otf',
);

@Injectable()
export class PdfRebuildGeneratorService implements IPdfRebuildGenerator {
  private readonly logger = new Logger(PdfRebuildGeneratorService.name);

  /**
   * Fit text into the given width using font size shrinking and ellipsis truncation.
   */
  private fitText(
    text: string,
    boxWidth: number,
    originalSize: number,
    measureWidth: (t: string, size: number) => number,
  ): { text: string; fontSize: number } {
    let fontSize = originalSize;
    while (fontSize > MIN_FONT_SIZE && measureWidth(text, fontSize) > boxWidth) {
      fontSize -= 0.5;
    }

    if (measureWidth(text, fontSize) > boxWidth) {
      if (boxWidth <= 0) {
        return { text: '', fontSize };
      }
      let truncated = text;
      while (
        truncated.length > 0 &&
        measureWidth(truncated + ELLIPSIS, fontSize) > boxWidth
      ) {
        truncated = truncated.slice(0, -1);
      }
      if (truncated.length === 0) {
        return { text: '', fontSize };
      }
      return { text: truncated + ELLIPSIS, fontSize };
    }

    return { text, fontSize };
  }

  async rebuild(
    blocks: TextBlock[],
    outputPath: string,
    options?: PdfGenerateOptions,
  ): Promise<void> {
    // Group blocks by page number to determine required pages
    const blocksByPage = new Map<number, TextBlock[]>();
    for (const block of blocks) {
      if (!blocksByPage.has(block.page)) {
        blocksByPage.set(block.page, []);
      }
      blocksByPage.get(block.page)!.push(block);
    }

    const pageNumbers = Array.from(blocksByPage.keys()).sort((a, b) => a - b);
    if (pageNumbers.length === 0) {
      // No blocks: create an empty single-page PDF
      const emptyDoc = await PDFDocument.create();
      emptyDoc.addPage([595.28, 841.89]); // A4
      const emptyBytes = await emptyDoc.save();
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(outputPath, emptyBytes);
      return;
    }

    // Create a new PDF document
    let newDoc: PDFDocument;
    try {
      newDoc = await PDFDocument.create();
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to create PDF document: ${(err as Error).message}`,
      );
    }

    // Register fontkit for custom font embedding
    newDoc.registerFontkit(fontkit);

    // Load font
    const fontPath = options?.fontPath ?? DEFAULT_FONT_PATH;
    let customFont: Awaited<ReturnType<PDFDocument['embedFont']>> | null = null;

    try {
      if (fs.existsSync(fontPath)) {
        const fontBytes = fs.readFileSync(fontPath);
        customFont = await newDoc.embedFont(fontBytes);
      }
    } catch {
      customFont = null;
    }

    const fallbackFont = await newDoc.embedFont(StandardFonts.Helvetica);
    const font = customFont ?? fallbackFont;

    // Determine page dimensions from blocks.
    // We infer a page height per page from the maximum y + height of blocks.
    // Default to A4 (595.28 x 841.89 pts) if blocks don't give us enough info.
    const DEFAULT_PAGE_WIDTH = 595.28;
    const DEFAULT_PAGE_HEIGHT = 841.89;

    for (const pageNum of pageNumbers) {
      const pageBlocks = blocksByPage.get(pageNum) ?? [];

      // Infer page size from block extents
      let pageWidth = DEFAULT_PAGE_WIDTH;
      let pageHeight = DEFAULT_PAGE_HEIGHT;

      for (const block of pageBlocks) {
        const maxX = block.x + block.width;
        const maxY = block.y + block.height;
        if (maxX > pageWidth) pageWidth = maxX + 72; // add a 1-inch margin guess
        if (maxY > pageHeight) pageHeight = maxY + 72;
      }

      const page = newDoc.addPage([pageWidth, pageHeight]);

      // Draw a white background
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: rgb(1, 1, 1),
        opacity: 1,
      });

      for (const block of pageBlocks) {
        const translatedText = block.translatedText ?? block.text;

        // pdf-lib uses bottom-left origin; TextBlock uses top-left origin.
        // pdfY = pageHeight - block.y - block.height
        const pdfY = pageHeight - block.y - block.height;

        const measureWidth = (t: string, size: number): number => {
          try {
            return font.widthOfTextAtSize(t, size);
          } catch {
            return t.length * size * 0.6;
          }
        };

        const { text: fittedText, fontSize: fittedSize } = this.fitText(
          translatedText,
          block.width > 0 ? block.width : DEFAULT_PAGE_WIDTH,
          block.fontSize > 0 ? block.fontSize : 12,
          measureWidth,
        );

        if (!fittedText) {
          continue;
        }

        const yOffset = (block.height - fittedSize) / 2;

        try {
          page.drawText(fittedText, {
            x: block.x,
            y: pdfY + yOffset,
            size: fittedSize,
            font,
            color: rgb(0, 0, 0),
          });
        } catch (err) {
          this.logger.warn(
            `rebuild 블록 렌더링 실패 (page=${block.page}, x=${block.x}, y=${block.y}): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    // Save result
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await newDoc.save();
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to serialize rebuilt PDF: ${(err as Error).message}`,
      );
    }

    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(outputPath, pdfBytes);
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to write rebuilt PDF to ${outputPath}: ${(err as Error).message}`,
      );
    }
  }
}
