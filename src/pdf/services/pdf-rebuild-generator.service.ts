import * as fs from 'fs';
import * as path from 'path';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
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
   * Fit text into the given width by shrinking font size or truncating with ellipsis.
   */
  private fitText(
    text: string,
    boxWidth: number,
    originalSize: number,
    measureWidth: (t: string, size: number) => number,
  ): { text: string; fontSize: number } {
    let fontSize = originalSize;

    // Phase 1: shrink font size
    while (fontSize > MIN_FONT_SIZE && measureWidth(text, fontSize) > boxWidth) {
      fontSize -= 0.5;
    }

    // Phase 2: truncate with ellipsis if still overflowing
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
    if (!blocks || blocks.length === 0) {
      throw new InternalServerErrorException(
        'No text blocks provided for rebuild',
      );
    }

    // Determine the total number of pages from the blocks
    const maxPage = Math.max(...blocks.map((b) => b.page));

    // Create a new PDF document
    let newDoc: PDFDocument;
    try {
      newDoc = await PDFDocument.create();
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to create new PDF document: ${(err as Error).message}`,
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
      // Fall back to standard font
      customFont = null;
    }

    const fallbackFont = await newDoc.embedFont(StandardFonts.Helvetica);
    const font = customFont ?? fallbackFont;

    // Group blocks by page
    const blocksByPage = new Map<number, TextBlock[]>();
    for (const block of blocks) {
      if (!blocksByPage.has(block.page)) {
        blocksByPage.set(block.page, []);
      }
      blocksByPage.get(block.page)!.push(block);
    }

    // Determine page dimensions from blocks.
    // We use a default A4 size (595 x 842 pts) unless blocks provide position hints.
    // The actual page size should come from the original PDF, but in rebuild mode
    // we reconstruct from the block coordinates to infer approximate page size.
    const pageDimensions = new Map<number, { width: number; height: number }>();
    for (let pageNum = 1; pageNum <= maxPage; pageNum++) {
      const pageBlocks = blocksByPage.get(pageNum) ?? [];
      if (pageBlocks.length === 0) {
        pageDimensions.set(pageNum, { width: 595, height: 842 });
        continue;
      }

      // Estimate page dimensions from the furthest block extents
      // (blocks have top-left origin coordinates)
      const maxRight = Math.max(...pageBlocks.map((b) => b.x + b.width));
      const maxBottom = Math.max(...pageBlocks.map((b) => b.y + b.height));

      // Use standard A4 if computed dimensions are too small
      const estimatedWidth = Math.max(maxRight + 72, 595);
      const estimatedHeight = Math.max(maxBottom + 72, 842);

      pageDimensions.set(pageNum, {
        width: estimatedWidth,
        height: estimatedHeight,
      });
    }

    // Add pages and draw translated text
    for (let pageNum = 1; pageNum <= maxPage; pageNum++) {
      const dims = pageDimensions.get(pageNum)!;
      const page = newDoc.addPage([dims.width, dims.height]);
      const pageBlocks = blocksByPage.get(pageNum) ?? [];

      for (const block of pageBlocks) {
        const displayText = block.translatedText ?? block.text;
        if (!displayText) {
          continue;
        }

        // TextBlock coordinates: top-left origin.
        // pdf-lib uses bottom-left origin.
        // pdfY = pageHeight - block.y - block.height
        const pdfY = dims.height - block.y - block.height;

        // Measure function
        const measureWidth = (t: string, size: number): number => {
          try {
            return font.widthOfTextAtSize(t, size);
          } catch {
            return t.length * size * 0.6;
          }
        };

        const { text: fittedText, fontSize: fittedSize } = this.fitText(
          displayText,
          block.width > 0 ? block.width : dims.width - block.x,
          block.fontSize > 0 ? block.fontSize : 10,
          measureWidth,
        );

        if (!fittedText) {
          continue;
        }

        // Center text vertically within the block height
        const yOffset = (block.height - fittedSize) / 2;

        try {
          page.drawText(fittedText, {
            x: block.x,
            y: pdfY + yOffset,
            size: fittedSize,
            font,
          });
        } catch (err) {
          this.logger.warn(
            `rebuild: 블록 렌더링 실패 (page=${block.page}, x=${block.x}, y=${block.y}): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    // Serialize
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await newDoc.save();
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to serialize rebuilt PDF: ${(err as Error).message}`,
      );
    }

    // Write to disk
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
