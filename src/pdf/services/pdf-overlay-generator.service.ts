import * as fs from 'fs';
import * as path from 'path';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { IPdfOverlayGenerator, PdfGenerateOptions, TextBlock } from '../interfaces';
import { renderPdfPages, RenderedPage } from '../utils/pdf-page-renderer';

/** Fraction of fontSize added below the baseline to cover descenders (g, p, y 등). */
const DESCENDER_PAD_RATIO = 0.2;
/** Line height multiplier relative to font size. */
const LINE_HEIGHT_RATIO = 1.2;

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
   * Wrap text into lines that fit within boxWidth at the given fontSize.
   * Supports both space-delimited (Latin) and character-level (CJK) wrapping.
   */
  private wrapText(
    text: string,
    boxWidth: number,
    fontSize: number,
    measureWidth: (t: string, size: number) => number,
  ): string[] {
    if (!text.trim()) return [];
    if (boxWidth <= 0) return [text];

    const lines: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      let end = remaining.length;
      // Shrink end until the slice fits, but always keep at least 1 character
      while (end > 1 && measureWidth(remaining.slice(0, end), fontSize) > boxWidth) {
        end--;
      }

      const slice = remaining.slice(0, end);
      const lastSpace = slice.lastIndexOf(' ');

      // Prefer breaking at a word boundary when the line isn't already at the end
      if (lastSpace > 0 && end < remaining.length) {
        lines.push(remaining.slice(0, lastSpace));
        remaining = remaining.slice(lastSpace + 1);
      } else {
        lines.push(slice);
        remaining = remaining.slice(end);
      }
    }

    return lines.filter((l) => l.length > 0);
  }

  /**
   * Sample the average background color from a 3-pixel-tall strip immediately
   * above (or below if at the top) the text block in the rasterized canvas.
   */
  private sampleBackgroundColor(
    ctx: { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray } },
    blockX: number,
    blockY: number,
    blockWidth: number,
    blockHeight: number,
    scale: number,
    canvasHeight: number,
  ): { r: number; g: number; b: number } {
    const px = Math.max(0, Math.floor(blockX * scale));
    const py = Math.floor(blockY * scale);
    const pw = Math.max(1, Math.floor(blockWidth * scale));
    const stripH = Math.max(1, Math.ceil(3 * scale));

    // Try sampling above the block; fall back to below if at top of page
    let sampleY = py - stripH;
    if (sampleY < 0) {
      sampleY = py + Math.ceil(blockHeight * scale);
    }

    if (sampleY < 0 || sampleY >= canvasHeight || pw <= 0) {
      return { r: 255, g: 255, b: 255 };
    }

    const actualH = Math.min(stripH, canvasHeight - sampleY);
    if (actualH <= 0) return { r: 255, g: 255, b: 255 };

    const imageData = ctx.getImageData(px, sampleY, pw, actualH);
    const data = imageData.data;

    let totalR = 0, totalG = 0, totalB = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      totalR += data[i];
      totalG += data[i + 1];
      totalB += data[i + 2];
      count++;
    }

    if (count === 0) return { r: 255, g: 255, b: 255 };
    return {
      r: Math.round(totalR / count),
      g: Math.round(totalG / count),
      b: Math.round(totalB / count),
    };
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

    // Only render pages that actually have translated blocks
    const usedPages = new Set(blocksByPage.keys());
    const pageImages: Map<number, RenderedPage> =
      usedPages.size > 0 ? await renderPdfPages(originalBuffer, usedPages) : new Map();

    // Load original PDF for copying pages that need no overlay
    let srcDoc: PDFDocument;
    try {
      srcDoc = await PDFDocument.load(originalBuffer);
    } catch (err) {
      throw new InternalServerErrorException(
        `PDF 페이지 렌더링 실패: ${(err as Error).message}`,
      );
    }
    const totalPages = srcDoc.getPageCount();

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

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

    const measureWidth = (t: string, size: number): number => {
      try {
        return font.widthOfTextAtSize(t, size);
      } catch {
        return t.length * size * 0.6;
      }
    };

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const rendered = pageImages.get(pageNum);

      if (!rendered) {
        // No translated blocks on this page — copy directly from the original PDF
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
      const pageBlocks = blocksByPage.get(pageNum) ?? [];

      // Pre-compute wrapped lines for all blocks (needed for fill height calculation)
      const fontSize = (block: TextBlock) => Math.max(block.fontSize, 6);
      const blockLines = new Map<TextBlock, string[]>();
      for (const block of pageBlocks) {
        const lines = this.wrapText(
          block.translatedText!,
          block.width,
          fontSize(block),
          measureWidth,
        );
        blockLines.set(block, lines);
      }

      // Modify the rasterized page: sample background and fill each text area
      let modifiedPngBuffer: Buffer;
      try {
        const img = await loadImage(pngBuffer);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img as Parameters<typeof ctx.drawImage>[0], 0, 0);
        const scale = img.width / width;

        for (const block of pageBlocks) {
          const lines = blockLines.get(block)!;
          const fs = fontSize(block);
          const lineHeight = fs * LINE_HEIGHT_RATIO;
          const totalTextH = lines.length * lineHeight;
          const fillH = Math.max(block.height, totalTextH) + fs * DESCENDER_PAD_RATIO;

          const { r, g, b } = this.sampleBackgroundColor(
            ctx,
            block.x,
            block.y,
            block.width,
            block.height,
            scale,
            img.height,
          );

          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(
            Math.floor(block.x * scale),
            Math.floor(block.y * scale),
            Math.ceil(block.width * scale),
            Math.ceil(fillH * scale),
          );
        }

        modifiedPngBuffer = canvas.toBuffer('image/png') as unknown as Buffer;
      } catch (err) {
        throw new InternalServerErrorException(
          `페이지 ${pageNum} 배경 처리 실패: ${(err as Error).message}`,
        );
      }

      let pngImage;
      try {
        pngImage = await pdfDoc.embedPng(modifiedPngBuffer);
      } catch (err) {
        throw new InternalServerErrorException(
          `페이지 ${pageNum} 이미지 임베딩 실패: ${(err as Error).message}`,
        );
      }

      const page = pdfDoc.addPage([width, height]);
      page.drawImage(pngImage, { x: 0, y: 0, width, height });

      // Draw translated text at original font size with line wrapping
      for (const block of pageBlocks) {
        const lines = blockLines.get(block)!;
        if (!lines.length) continue;

        // pdf-lib uses bottom-left origin; pdfjs extraction uses top-left origin
        const pdfY = height - block.y - block.height;
        const fs = fontSize(block);
        const lineHeight = fs * LINE_HEIGHT_RATIO;

        for (let i = 0; i < lines.length; i++) {
          // Start from the top of the block, moving downward per line
          const lineY = pdfY + block.height - fs - i * lineHeight;
          if (lineY < 0) {
            this.logger.warn(
              `줄 ${i + 1} Y좌표(${lineY.toFixed(1)})가 페이지 경계 밖 — 생략 (page=${block.page}, x=${block.x}, y=${block.y})`,
            );
            continue;
          }
          try {
            page.drawText(lines[i], {
              x: block.x,
              y: lineY,
              size: fs,
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
