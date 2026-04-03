import * as fs from 'fs';
import * as path from 'path';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { IPdfOverlayGenerator, PdfGenerateOptions, TextBlock } from '../interfaces';

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
export class PdfOverlayGeneratorService implements IPdfOverlayGenerator {
  private readonly logger = new Logger(PdfOverlayGeneratorService.name);
  /**
   * Fit text into the given width using font size shrinking and ellipsis truncation.
   * Returns the adjusted text and font size to use.
   *
   * @param text         The text to fit
   * @param boxWidth     Available width in points
   * @param originalSize The preferred font size
   * @param measureWidth A function(text, fontSize) => number returning text width
   */
  private fitText(
    text: string,
    boxWidth: number,
    originalSize: number,
    measureWidth: (t: string, size: number) => number,
  ): { text: string; fontSize: number } {
    // Phase 1: shrink font size until text fits
    let fontSize = originalSize;
    while (fontSize > MIN_FONT_SIZE && measureWidth(text, fontSize) > boxWidth) {
      fontSize -= 0.5;
    }

    // Phase 2: if still overflows at minimum size, truncate with ellipsis
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

  async overlay(
    originalBuffer: Buffer,
    blocks: TextBlock[],
    outputPath: string,
    options?: PdfGenerateOptions,
  ): Promise<void> {
    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(originalBuffer);
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to load PDF for overlay: ${(err as Error).message}`,
      );
    }

    // Register fontkit for custom font embedding
    pdfDoc.registerFontkit(fontkit);

    // Load font bytes
    const fontPath = options?.fontPath ?? DEFAULT_FONT_PATH;
    let customFont: Awaited<ReturnType<PDFDocument['embedFont']>> | null = null;

    try {
      if (fs.existsSync(fontPath)) {
        const fontBytes = fs.readFileSync(fontPath);
        customFont = await pdfDoc.embedFont(fontBytes);
      }
    } catch {
      // Fall back to standard font if custom font fails to load
      customFont = null;
    }

    // Fall back to standard Helvetica if custom font unavailable
    const fallbackFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const font = customFont ?? fallbackFont;

    const pages = pdfDoc.getPages();

    for (const block of blocks) {
      // Only process blocks with translated text
      const translatedText = block.translatedText;
      if (!translatedText) {
        continue;
      }

      // PDF pages are 1-indexed; array is 0-indexed
      const pageIndex = block.page - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) {
        continue;
      }

      const page = pages[pageIndex];
      const { height: pageHeight } = page.getSize();

      // TextBlock coordinates: x, y are top-left origin (from pdfjs extraction).
      // pdf-lib uses bottom-left origin.
      // pdfjs extraction: y = pageHeight - pdfY - blockHeight
      // Therefore: pdfY = pageHeight - block.y - block.height
      const pdfY = pageHeight - block.y - block.height;

      // Draw white rectangle to cover original text (POC: works on white-background PDFs only)
      page.drawRectangle({
        x: block.x,
        y: pdfY,
        width: block.width,
        height: block.height,
        color: rgb(1, 1, 1),
        opacity: 1,
      });

      // Measure function for overflow handling
      const measureWidth = (t: string, size: number): number => {
        try {
          return font.widthOfTextAtSize(t, size);
        } catch {
          return t.length * size * 0.6; // rough approximation
        }
      };

      const { text: fittedText, fontSize: fittedSize } = this.fitText(
        translatedText,
        block.width,
        block.fontSize,
        measureWidth,
      );

      // Draw translated text at same position
      // Align baseline: center vertically within the block
      const textHeight = fittedSize;
      const yOffset = (block.height - textHeight) / 2;

      try {
        page.drawText(fittedText, {
          x: block.x,
          y: pdfY + yOffset,
          size: fittedSize,
          font,
          color: rgb(0, 0, 0),
        });
      } catch (err) {
        // If the font cannot encode the text (e.g. CJK chars with fallback font),
        // skip rendering this block's text. The white rectangle has already been
        // drawn, so the original text is still hidden.
        this.logger.warn(
          `블록 렌더링 실패 (page=${block.page}, x=${block.x}, y=${block.y}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Save result
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await pdfDoc.save();
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to serialize overlay PDF: ${(err as Error).message}`,
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
        `Failed to write overlay PDF to ${outputPath}: ${(err as Error).message}`,
      );
    }
  }
}
