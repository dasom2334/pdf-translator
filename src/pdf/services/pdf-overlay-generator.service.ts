import * as fs from 'fs';
import * as path from 'path';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import { IPdfOverlayGenerator, PdfGenerateOptions, TextBlock } from '../interfaces';
import { renderPdfPages, RenderedPage } from '../utils/pdf-page-renderer';

const MIN_FONT_SIZE = 4;
const ELLIPSIS = '...';
/** Fraction of fontSize added below the baseline to cover descenders (g, p, y 등). */
const DESCENDER_PAD_RATIO = 0.2;

/**
 * Default bundled font path (Noto Sans CJK KR).
 * Falls back to a standard font if the file doesn't exist.
 */
const DEFAULT_FONT_PATH = path.resolve(
  __dirname,
  '../../../assets/fonts/NotoSansCJKkr-Regular.otf',
);

/**
 * Remove BT...ET text-rendering segments from raw PDF byte content.
 *
 * This works at the raw-byte level by scanning for the literal byte sequences
 * `BT` and `ET` (preceded/followed by whitespace or stream boundaries) and
 * replacing everything between them (inclusive) with spaces, preserving the
 * original stream length so no cross-reference table rewrite is required.
 *
 * This approach is effective for PDFs whose content streams are not
 * compressed (e.g., PDFs produced by most word processors with plain text
 * streams). For PDFs with fully-compressed content streams the markers will
 * not be found and the function returns `changed: false`.
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

  const isWhitespaceOrBoundary = (pos: number): boolean =>
    pos < 0 ||
    pos >= buf.length ||
    buf[pos] === 0x20 ||
    buf[pos] === 0x09 ||
    buf[pos] === 0x0a ||
    buf[pos] === 0x0d;

  while (i < buf.length - 1) {
    if (
      buf[i] === 0x42 &&
      buf[i + 1] === 0x54 &&
      isWhitespaceOrBoundary(i - 1) &&
      isWhitespaceOrBoundary(i + 2)
    ) {
      let j = i + 2;
      let found = false;

      while (j < buf.length - 1) {
        if (
          buf[j] === 0x45 &&
          buf[j + 1] === 0x54 &&
          isWhitespaceOrBoundary(j - 1) &&
          isWhitespaceOrBoundary(j + 2)
        ) {
          const endExclusive = j + 2;
          for (let k = i; k < endExclusive; k++) {
            buf[k] = 0x20;
          }
          changed = true;
          i = endExclusive;
          found = true;
          break;
        }
        j++;
      }

      if (!found) {
        i += 2;
      }
      continue;
    }

    i++;
  }

  return { strippedBytes: buf, changed };
}

@Injectable()
export class PdfOverlayGeneratorService implements IPdfOverlayGenerator {
  private readonly logger = new Logger(PdfOverlayGeneratorService.name);
  // 같은 경로의 폰트 파일은 첫 호출에만 읽고 이후 재사용 — 16MB I/O 중복 방지
  private readonly fontBytesCache = new Map<string, Buffer>();

  private readFontBytes(fontPath: string): Buffer | null {
    if (this.fontBytesCache.has(fontPath)) return this.fontBytesCache.get(fontPath)!;
    if (!fs.existsSync(fontPath)) return null;
    const bytes = Buffer.from(fs.readFileSync(fontPath));
    this.fontBytesCache.set(fontPath, bytes);
    return bytes;
  }

  /**
   * Fit text into the given width using font size shrinking and ellipsis truncation.
   */
  fitText(
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

  async overlay(
    originalBuffer: Buffer,
    blocks: TextBlock[],
    outputPath: string,
    options?: PdfGenerateOptions,
  ): Promise<void> {
    // Group translated blocks by page number
    const blocksByPage = new Map<number, TextBlock[]>();
    for (const block of blocks) {
      if (!block.translatedText) continue;
      if (!blocksByPage.has(block.page)) blocksByPage.set(block.page, []);
      blocksByPage.get(block.page)!.push(block);
    }

    // Only render pages that actually have translated blocks — avoids rasterizing
    // the entire PDF when --pages selects a small subset of a large document.
    const usedPages = new Set(blocksByPage.keys());
    // usedPages가 비어 있으면 렌더링할 페이지가 없으므로 빈 Map을 직접 사용
    const pageImages: Map<number, RenderedPage> =
      usedPages.size > 0 ? await renderPdfPages(originalBuffer, usedPages) : new Map();

    // Load original PDF for copying pages that need no overlay.
    let srcDoc: PDFDocument;
    try {
      srcDoc = await PDFDocument.load(originalBuffer);
    } catch (err) {
      throw new InternalServerErrorException(
        `PDF 페이지 렌더링 실패: ${(err as Error).message}`,
      );
    }
    const totalPages = srcDoc.getPageCount();

    // Build a new PDF document.
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // Load font (bytes cached per path to avoid repeated 16MB disk reads)
    const fontPath = options?.fontPath ?? DEFAULT_FONT_PATH;
    let customFont: Awaited<ReturnType<PDFDocument['embedFont']>> | null = null;
    try {
      const fontBytes = this.readFontBytes(fontPath);
      if (fontBytes) customFont = await pdfDoc.embedFont(fontBytes);
    } catch {
      customFont = null;
    }
    const fallbackFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const font = customFont ?? fallbackFont;

    // For each page: if it has overlay blocks, rasterize + overlay; otherwise copy as-is.
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const rendered = pageImages.get(pageNum);

      if (!rendered) {
        // No translated blocks on this page — copy directly from the original PDF
        // without rasterization, preserving vector quality and saving memory.
        try {
          const [copiedPage] = await pdfDoc.copyPages(srcDoc, [pageNum - 1]);
          pdfDoc.addPage(copiedPage);
        } catch (err) {
          throw new InternalServerErrorException(
            `페이지 ${pageNum} 복사 실패: ${(err as Error).message}`,
          );
        }
        continue;
      }

      const { pngBuffer, width, height } = rendered;

      let pngImage;
      try {
        pngImage = await pdfDoc.embedPng(pngBuffer);
      } catch (err) {
        throw new InternalServerErrorException(
          `페이지 ${pageNum} 이미지 임베딩 실패: ${(err as Error).message}`,
        );
      }

      const page = pdfDoc.addPage([width, height]);

      // Draw the rendered page image as full-page background
      page.drawImage(pngImage, { x: 0, y: 0, width, height });

      // Overlay translated text blocks
      for (const block of blocksByPage.get(pageNum) ?? []) {
        // pdf-lib uses bottom-left origin; pdfjs extraction uses top-left origin
        const pdfY = height - block.y - block.height;

        // Cover original text in the rasterized image with a white box.
        // Descenders (g, p, y) extend below the baseline, so pad downward.
        const descenderPad = block.fontSize * DESCENDER_PAD_RATIO;
        page.drawRectangle({
          x: block.x,
          y: pdfY - descenderPad,
          width: block.width,
          height: block.height + descenderPad,
          color: rgb(1, 1, 1),
          opacity: 1,
        });

        const measureWidth = (t: string, size: number): number => {
          try {
            return font.widthOfTextAtSize(t, size);
          } catch {
            return t.length * size * 0.6;
          }
        };

        const { text: fittedText, fontSize: fittedSize } = this.fitText(
          block.translatedText!,
          block.width,
          block.fontSize,
          measureWidth,
        );

        if (!fittedText) continue;

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
            `블록 렌더링 실패 (page=${block.page}, x=${block.x}, y=${block.y}): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    // Serialize and write
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await pdfDoc.save();
    } catch (err) {
      throw new InternalServerErrorException(
        `오버레이 PDF 직렬화 실패: ${(err as Error).message}`,
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
        `오버레이 PDF 저장 실패 (${outputPath}): ${(err as Error).message}`,
      );
    }
  }
}
