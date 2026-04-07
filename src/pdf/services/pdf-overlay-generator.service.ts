import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
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
 * Remove all BT...ET text operator sequences from a PDF content stream buffer.
 * This erases original text from the stream while preserving graphics/images.
 */
function removeTextOperatorsFromStream(streamBuf: Buffer): Buffer {
  // We work on the raw bytes as a string for regex-based BT...ET removal.
  // Using latin1 encoding to preserve raw bytes faithfully.
  const content = streamBuf.toString('binary');

  // Remove BT ... ET blocks (including nested/multiline)
  // BT and ET are always full tokens separated by whitespace
  let cleaned = content;
  let searchFrom = 0;
  for (;;) {
    const btIdx = cleaned.indexOf('BT', searchFrom);
    if (btIdx === -1) break;

    // Verify BT is a standalone operator (preceded by whitespace or start, followed by whitespace)
    const before = btIdx === 0 ? '\n' : cleaned[btIdx - 1];
    const after = cleaned[btIdx + 2];
    if (!/[\s\r\n]/.test(before) || !/[\s\r\n]/.test(after)) {
      // Not a standalone BT token — advance past this position to avoid infinite loop
      searchFrom = btIdx + 2;
      continue;
    }

    let etSearchFrom = btIdx + 2;
    let etIdx = -1;
    for (;;) {
      const candidateEt = cleaned.indexOf('ET', etSearchFrom);
      if (candidateEt === -1) break;

      // Verify ET is also a standalone operator
      const beforeEt = candidateEt === 0 ? '\n' : cleaned[candidateEt - 1];
      const afterEt =
        candidateEt + 2 >= cleaned.length ? '\n' : cleaned[candidateEt + 2];
      if (/[\s\r\n]/.test(beforeEt) && /[\s\r\n]/.test(afterEt)) {
        etIdx = candidateEt;
        break;
      }
      // Not standalone ET — advance past this position
      etSearchFrom = candidateEt + 2;
    }

    if (etIdx === -1) break;

    // Replace the BT...ET block (inclusive) with whitespace to preserve offsets
    const block = cleaned.slice(btIdx, etIdx + 2);
    cleaned =
      cleaned.slice(0, btIdx) +
      ' '.repeat(block.length) +
      cleaned.slice(etIdx + 2);

    // After replacement, continue searching from the same position (content shifted)
    searchFrom = btIdx;
  }

  return Buffer.from(cleaned, 'binary');
}

/**
 * Given a raw PDF buffer, attempt to remove text operators from all page
 * content streams using low-level byte manipulation.
 *
 * Returns a new Buffer with text operators removed, or the original buffer
 * if parsing fails (so the overlay white-box approach can be used as fallback).
 */
function removeTextFromPdfStreams(pdfBytes: Buffer): Buffer {
  try {
    // Convert to string (latin1 to preserve bytes) for regex operations
    let pdf = pdfBytes.toString('binary');

    // Find all stream...endstream pairs
    const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
    let match: RegExpExecArray | null;
    // Each replacement also carries the location of the /Length value to update
    const replacements: Array<{
      start: number;
      end: number;
      replacement: string;
      lengthValueStart: number;
      lengthValueEnd: number;
      newLength: number;
    }> = [];

    while ((match = streamRegex.exec(pdf)) !== null) {
      // Handle \r\n vs \n
      const headerEnd = pdf.indexOf('\n', match.index + 6);
      const dataStart = headerEnd + 1;
      const dataEnd = match.index + match[0].lastIndexOf('endstream') - 1;

      if (dataEnd <= dataStart) continue;

      const rawData = Buffer.from(pdf.slice(dataStart, dataEnd), 'binary');

      // Try to decompress (FlateDecode / zlib) and check if it's a content stream
      let streamContent: Buffer;
      let isCompressed = false;

      try {
        streamContent = zlib.inflateSync(rawData);
        isCompressed = true;
      } catch {
        // Not compressed or different compression — try raw
        streamContent = rawData;
      }

      // Check if this stream contains PDF text operators (BT/ET)
      const contentStr = streamContent.toString('binary');
      if (!contentStr.includes('BT')) {
        continue; // Not a content stream with text — skip
      }

      // Remove text operators
      const cleaned = removeTextOperatorsFromStream(streamContent);

      // Re-compress if original was compressed
      let newData: Buffer;
      if (isCompressed) {
        try {
          newData = zlib.deflateSync(cleaned);
        } catch {
          newData = cleaned;
        }
      } else {
        newData = cleaned;
      }

      // Locate the /Length entry in the stream dictionary.
      // The dictionary ends at the 'stream' keyword; search backwards from match.index.
      const dictRegion = pdf.slice(0, match.index);
      const lengthMatch = /\/Length\s+(\d+)/.exec(
        dictRegion.slice(Math.max(0, dictRegion.length - 512)),
      );

      // Replace the stream data with text-operator-removed content
      const newDataStr = newData.toString('binary');

      if (lengthMatch) {
        // Absolute offset of the matched /Length value within full pdf string
        const regionOffset = Math.max(0, dictRegion.length - 512);
        const lengthValueStart =
          regionOffset +
          lengthMatch.index +
          lengthMatch[0].indexOf(lengthMatch[1]);
        const lengthValueEnd = lengthValueStart + lengthMatch[1].length;

        replacements.push({
          start: dataStart,
          end: dataEnd,
          replacement: newDataStr,
          lengthValueStart,
          lengthValueEnd,
          newLength: newData.length,
        });
      } else {
        // No /Length found — still replace data, skip length update
        replacements.push({
          start: dataStart,
          end: dataEnd,
          replacement: newDataStr,
          lengthValueStart: -1,
          lengthValueEnd: -1,
          newLength: newData.length,
        });
      }
    }

    // Apply all replacements. Because /Length entries always appear BEFORE
    // their stream data in the PDF, we process in reverse offset order so
    // earlier indices remain valid as we splice the string.
    const sortedReplacements = [...replacements].sort(
      (a, b) => b.start - a.start, // descending — process last stream first
    );

    for (const rep of sortedReplacements) {
      // 1. Replace stream data
      pdf =
        pdf.slice(0, rep.start) +
        rep.replacement +
        pdf.slice(rep.end);

      // 2. Update /Length value (its offset is before the stream data, so still valid)
      if (rep.lengthValueStart >= 0) {
        const newLengthStr = String(rep.newLength);
        pdf =
          pdf.slice(0, rep.lengthValueStart) +
          newLengthStr +
          pdf.slice(rep.lengthValueEnd);
      }
    }

    return Buffer.from(pdf, 'binary');
  } catch {
    // If anything fails, return original buffer unchanged
    return pdfBytes;
  }
}

@Injectable()
export class PdfOverlayGeneratorService implements IPdfOverlayGenerator {
  private readonly logger = new Logger(PdfOverlayGeneratorService.name);

  /**
   * Fit text into the given width using font size shrinking and ellipsis truncation.
   * Returns the adjusted text and font size to use.
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
    // G-5: Remove text from content streams first to handle non-white backgrounds.
    // Fall back to white-box approach if stream manipulation fails.
    const processedBuffer = removeTextFromPdfStreams(originalBuffer);

    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(processedBuffer);
    } catch {
      // If loading the stream-cleaned PDF fails, fall back to original
      try {
        pdfDoc = await PDFDocument.load(originalBuffer);
      } catch (err) {
        throw new InternalServerErrorException(
          `Failed to load PDF for overlay: ${(err as Error).message}`,
        );
      }
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

      if (!fittedText) {
        continue;
      }

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
