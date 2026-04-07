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

/**
 * G-5: Remove BT...ET text-rendering segments from raw PDF byte content.
 *
 * This works at the raw-byte level by scanning for the literal byte sequences
 * `BT` and `ET` (preceded/followed by whitespace or stream boundaries) and
 * replacing everything between them (inclusive) with spaces, preserving the
 * original stream length so no cross-reference table rewrite is required.
 *
 * This approach is effective for PDFs whose content streams are not
 * compressed (e.g., PDFs produced by most word processors with plain text
 * streams). For PDFs with fully-compressed content streams the markers will
 * not be found and the function returns `changed: false`, allowing the caller
 * to fall back gracefully to the white-box overlay method.
 *
 * @param pdfBytes  Raw bytes of the original PDF.
 * @returns         Modified bytes and a flag indicating whether any BT/ET
 *                  segment was found and removed.
 */
export function stripBtEtFromPdfBytes(pdfBytes: Buffer): {
  strippedBytes: Buffer;
  changed: boolean;
} {
  const buf = Buffer.from(pdfBytes); // mutable copy
  let changed = false;
  let i = 0;

  /**
   * Returns true if the byte at position `pos` is a PDF whitespace character
   * (space, tab, CR, LF) or if `pos` is out of buffer bounds.
   */
  const isWhitespaceOrBoundary = (pos: number): boolean =>
    pos < 0 ||
    pos >= buf.length ||
    buf[pos] === 0x20 || // space
    buf[pos] === 0x09 || // tab
    buf[pos] === 0x0a || // LF
    buf[pos] === 0x0d;   // CR

  while (i < buf.length - 1) {
    // Detect `BT` operator: bytes 0x42 0x54 with surrounding whitespace
    if (
      buf[i] === 0x42 &&
      buf[i + 1] === 0x54 &&
      isWhitespaceOrBoundary(i - 1) &&
      isWhitespaceOrBoundary(i + 2)
    ) {
      // Scan forward for the matching `ET` operator
      let j = i + 2;
      let found = false;

      while (j < buf.length - 1) {
        if (
          buf[j] === 0x45 &&
          buf[j + 1] === 0x54 &&
          isWhitespaceOrBoundary(j - 1) &&
          isWhitespaceOrBoundary(j + 2)
        ) {
          // Replace BT...ET (inclusive) with spaces
          const endExclusive = j + 2;
          for (let k = i; k < endExclusive; k++) {
            buf[k] = 0x20; // space character
          }
          changed = true;
          i = endExclusive;
          found = true;
          break;
        }
        j++;
      }

      if (!found) {
        // No matching ET — skip past this BT
        i += 2;
      }
      continue;
    }

    i++;
  }

  return { strippedBytes: buf, changed };
}

/**
 * Load a PDFDocument from raw bytes, with a fallback buffer if the primary
 * load fails. Returns the loaded document and the buffer that was actually
 * used (useful for callers to know whether the stripped version was loaded).
 */
async function loadPdfDocument(
  primaryBuffer: Buffer,
  fallbackBuffer: Buffer | null,
  onFallback: () => void,
): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(primaryBuffer);
  } catch (primaryErr) {
    if (fallbackBuffer !== null) {
      onFallback();
      try {
        return await PDFDocument.load(fallbackBuffer);
      } catch (fallbackErr) {
        throw new InternalServerErrorException(
          `Failed to load PDF for overlay: ${(fallbackErr as Error).message}`,
        );
      }
    }
    throw new InternalServerErrorException(
      `Failed to load PDF for overlay: ${(primaryErr as Error).message}`,
    );
  }
}

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
  fitText(
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
    // --- G-5: attempt raw-bytes BT/ET removal ---
    // Try to remove original text operators from the PDF byte stream so that
    // translated text can be placed over a clean background without needing
    // opaque white rectangles. Falls back to the white-box approach when the
    // content streams are compressed (BT/ET markers not found in raw bytes).
    const { strippedBytes, changed: streamStripped } =
      stripBtEtFromPdfBytes(originalBuffer);

    const pdfDoc = await loadPdfDocument(
      streamStripped ? strippedBytes : originalBuffer,
      streamStripped ? originalBuffer : null,
      () =>
        this.logger.warn(
          'G-5: stripped PDF failed to load, falling back to original buffer',
        ),
    );

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

      // If stream stripping did not remove original text (e.g. compressed streams),
      // fall back to the white-box method to cover the original text.
      if (!streamStripped) {
        page.drawRectangle({
          x: block.x,
          y: pdfY,
          width: block.width,
          height: block.height,
          color: rgb(1, 1, 1),
          opacity: 1,
        });
      }

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
        // skip rendering this block's text. When stream stripping was applied the
        // original text is already removed; when falling back to white-box, the
        // rectangle has already been drawn.
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
