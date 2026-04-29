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

@Injectable()
export class PdfRebuildGeneratorService implements IPdfRebuildGenerator {
  private readonly logger = new Logger(PdfRebuildGeneratorService.name);
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

    const maxPage = Math.max(...blocks.map((b) => b.page));

    let newDoc: PDFDocument;
    try {
      newDoc = await PDFDocument.create();
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to create new PDF document: ${(err as Error).message}`,
      );
    }

    newDoc.registerFontkit(fontkit);

    const fontPath = options?.fontPath ?? DEFAULT_FONT_PATH;
    let customFont: Awaited<ReturnType<PDFDocument['embedFont']>> | null = null;

    try {
      const fontBytes = this.readFontBytes(fontPath);
      if (fontBytes) customFont = await newDoc.embedFont(fontBytes);
    } catch {
      customFont = null;
    }

    const fallbackFont = await newDoc.embedFont(StandardFonts.Helvetica);
    const font = customFont ?? fallbackFont;

    const measureWidth = (t: string, size: number): number => {
      try {
        return font.widthOfTextAtSize(t, size);
      } catch {
        return t.length * size * 0.6;
      }
    };

    // Group blocks by page
    const blocksByPage = new Map<number, TextBlock[]>();
    for (const block of blocks) {
      if (!blocksByPage.has(block.page)) {
        blocksByPage.set(block.page, []);
      }
      blocksByPage.get(block.page)!.push(block);
    }

    // Pre-compute wrapped lines per block, then compute page dimensions accounting
    // for overflow (translated text may be taller than the original block).
    const blockLinesMap = new Map<TextBlock, string[]>();
    for (const block of blocks) {
      const displayText = block.translatedText ?? block.text;
      if (!displayText) continue;
      const fs = Math.max(block.fontSize, 6);
      const lines = this.wrapText(
        displayText,
        block.width > 0 ? block.width : 9999,
        fs,
        measureWidth,
      );
      blockLinesMap.set(block, lines);
    }

    const pageDimensions = new Map<number, { width: number; height: number }>();
    for (let pageNum = 1; pageNum <= maxPage; pageNum++) {
      const pageBlocks = blocksByPage.get(pageNum) ?? [];
      if (pageBlocks.length === 0) {
        pageDimensions.set(pageNum, { width: 595, height: 842 });
        continue;
      }

      const maxRight = Math.max(...pageBlocks.map((b) => b.x + b.width));

      // Account for extra height when wrapped lines overflow the original block
      let maxBottom = 0;
      for (const block of pageBlocks) {
        const fs = Math.max(block.fontSize, 6);
        const lines = blockLinesMap.get(block) ?? [];
        const lineHeight = fs * LINE_HEIGHT_RATIO;
        const renderedH = lines.length > 0 ? lines.length * lineHeight : block.height;
        const bottom = block.y + Math.max(block.height, renderedH);
        if (bottom > maxBottom) maxBottom = bottom;
      }

      pageDimensions.set(pageNum, {
        width: Math.max(maxRight + 72, 595),
        height: Math.max(maxBottom + 72, 842),
      });
    }

    // Add pages and draw translated text at original font size with line wrapping
    for (let pageNum = 1; pageNum <= maxPage; pageNum++) {
      const dims = pageDimensions.get(pageNum)!;
      const page = newDoc.addPage([dims.width, dims.height]);
      const pageBlocks = blocksByPage.get(pageNum) ?? [];

      for (const block of pageBlocks) {
        const displayText = block.translatedText ?? block.text;
        if (!displayText) continue;

        const lines = blockLinesMap.get(block);
        if (!lines || lines.length === 0) continue;

        // TextBlock coordinates: top-left origin.
        // pdf-lib uses bottom-left origin.
        const pdfY = dims.height - block.y - block.height;
        const fs = Math.max(block.fontSize, 6);
        const lineHeight = fs * LINE_HEIGHT_RATIO;

        for (let i = 0; i < lines.length; i++) {
          // Start from the top of the block, moving downward per line
          const lineY = pdfY + block.height - fs - i * lineHeight;
          try {
            page.drawText(lines[i], {
              x: block.x,
              y: lineY,
              size: fs,
              font,
            });
          } catch (err) {
            this.logger.warn(
              `rebuild: 블록 렌더링 실패 (page=${block.page}, x=${block.x}, y=${block.y}): ${err instanceof Error ? err.message : String(err)}`,
            );
          }
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
