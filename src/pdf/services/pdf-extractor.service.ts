import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { IPdfExtractor, TextBlock } from '../interfaces';
import { getPdfjs } from '../utils/pdfjs-loader';

// PDF magic bytes: %PDF
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];

/**
 * Y-coordinate tolerance (in points) for grouping items on the same line.
 */
const SAME_LINE_THRESHOLD = 2;

/**
 * Fraction of page height used to define header/footer zones.
 * Top MARGIN_RATIO of the page = header zone, bottom MARGIN_RATIO = footer zone.
 */
const HEADER_FOOTER_MARGIN_RATIO = 0.07;

/**
 * Minimum number of pages on which a text pattern must appear to be considered
 * a header or footer (repeating pattern).
 */
const MIN_REPEAT_PAGES = 2;

/**
 * Maximum horizontal distance (in points) between two adjacent blocks to be
 * merged into one paragraph block.
 */
const MERGE_GAP_THRESHOLD = 20;

@Injectable()
export class PdfExtractorService implements IPdfExtractor {
  private validateBuffer(fileBuffer: Buffer): void {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('File buffer is empty');
    }

    const magic = [
      fileBuffer[0],
      fileBuffer[1],
      fileBuffer[2],
      fileBuffer[3],
    ];
    const isPdf = PDF_MAGIC.every((byte, i) => byte === magic[i]);
    if (!isPdf) {
      throw new BadRequestException(
        'File is not a valid PDF (invalid magic bytes)',
      );
    }
  }

  /**
   * Parse a pageRange string like "1-3,5,7-9" into an array of 1-based page numbers.
   */
  private parsePageRange(pageRange: string, totalPages: number): number[] {
    const pages: Set<number> = new Set();
    const parts = pageRange.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        for (let p = start; p <= end; p++) {
          if (p >= 1 && p <= totalPages) {
            pages.add(p);
          }
        }
      } else if (/^\d+$/.test(trimmed)) {
        const p = parseInt(trimmed, 10);
        if (p >= 1 && p <= totalPages) {
          pages.add(p);
        }
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  }

  /**
   * Sanitize text by collapsing excess whitespace and removing control characters.
   */
  private sanitizeText(text: string): string {
    return text
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // remove control chars
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async extractRawBlocksFromPage(
    pdfPage: unknown,
    pageNumber: number,
  ): Promise<TextBlock[]> {
    const page = pdfPage as {
      getViewport: (opts: { scale: number }) => { height: number };
      getTextContent: () => Promise<{
        items: Array<{
          str?: string;
          transform?: number[];
          width?: number;
          height?: number;
          fontName?: string;
          type?: string;
        }>;
      }>;
    };

    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;

    const textContent = await page.getTextContent();
    const blocks: TextBlock[] = [];

    for (const item of textContent.items) {
      // Skip TextMarkedContent items (they have a 'type' property but no 'str')
      if (!('str' in item) || item.str === undefined) {
        continue;
      }

      const rawText = item.str;
      const text = this.sanitizeText(rawText);
      if (!text) {
        continue;
      }

      // transform = [a, b, c, d, e, f]
      // e = x, f = y (in PDF coordinates, origin bottom-left)
      // fontSize = sqrt(a^2 + b^2) (scale factor of the matrix)
      const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
      const a = transform[0];
      const b = transform[1];
      const fontSize = Math.sqrt(a * a + b * b);

      // Convert PDF coordinate (bottom-left origin) to top-left origin
      const pdfX = transform[4];
      const pdfY = transform[5];
      const x = pdfX;
      const y = pageHeight - pdfY - (item.height ?? fontSize);

      const block: TextBlock = {
        text,
        page: pageNumber,
        x,
        y,
        width: item.width ?? 0,
        height: item.height ?? fontSize,
        fontSize: Math.round(fontSize * 100) / 100,
        fontName: item.fontName ?? '',
      };

      blocks.push(block);
    }

    return blocks;
  }

  /**
   * Sort blocks in reading order: top-to-bottom (Y), then left-to-right (X).
   * Items on the same line (within SAME_LINE_THRESHOLD) are grouped first.
   */
  private sortBlocksInReadingOrder(blocks: TextBlock[]): TextBlock[] {
    return [...blocks].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) <= SAME_LINE_THRESHOLD) {
        return a.x - b.x;
      }
      return yDiff;
    });
  }

  /**
   * Detect header and footer texts that appear on multiple pages.
   * Returns a Set of text strings to be excluded.
   */
  private detectHeaderFooterTexts(
    pageBlocks: TextBlock[][],
    pageHeights: number[],
  ): Set<string> {
    const textPageCount = new Map<string, number>();

    for (let i = 0; i < pageBlocks.length; i++) {
      const blocks = pageBlocks[i];
      const pageHeight = pageHeights[i];
      const margin = pageHeight * HEADER_FOOTER_MARGIN_RATIO;

      const seenOnThisPage = new Set<string>();
      for (const block of blocks) {
        // Header zone: y < margin (top of page in top-left origin)
        // Footer zone: y > pageHeight - margin
        const isInHeaderZone = block.y < margin;
        const isInFooterZone = block.y > pageHeight - margin;

        if (isInHeaderZone || isInFooterZone) {
          if (!seenOnThisPage.has(block.text)) {
            seenOnThisPage.add(block.text);
            textPageCount.set(
              block.text,
              (textPageCount.get(block.text) ?? 0) + 1,
            );
          }
        }
      }
    }

    const repeatedTexts = new Set<string>();
    for (const [text, count] of textPageCount) {
      if (count >= MIN_REPEAT_PAGES) {
        repeatedTexts.add(text);
      }
    }
    return repeatedTexts;
  }

  /**
   * Merge horizontally adjacent blocks on the same line into paragraph blocks.
   * Two blocks are merged if they are on the same line (within SAME_LINE_THRESHOLD)
   * and the horizontal gap between them is within MERGE_GAP_THRESHOLD.
   */
  private mergeAdjacentBlocks(blocks: TextBlock[]): TextBlock[] {
    if (blocks.length === 0) return [];

    const result: TextBlock[] = [];
    let current = { ...blocks[0] };

    for (let i = 1; i < blocks.length; i++) {
      const next = blocks[i];
      const yDiff = Math.abs(next.y - current.y);
      const gap = next.x - (current.x + current.width);

      if (yDiff <= SAME_LINE_THRESHOLD && gap <= MERGE_GAP_THRESHOLD && gap >= 0) {
        // Merge next into current
        const mergedWidth = next.x + next.width - current.x;
        current = {
          ...current,
          text: current.text + ' ' + next.text,
          width: mergedWidth,
          height: Math.max(current.height, next.height),
          fontSize: Math.max(current.fontSize, next.fontSize),
        };
      } else {
        result.push(current);
        current = { ...next };
      }
    }
    result.push(current);

    return result;
  }

  private async extractBlocksFromPage(
    pdfPage: unknown,
    pageNumber: number,
  ): Promise<{ blocks: TextBlock[]; pageHeight: number }> {
    const page = pdfPage as {
      getViewport: (opts: { scale: number }) => { height: number };
    };
    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;

    const rawBlocks = await this.extractRawBlocksFromPage(pdfPage, pageNumber);
    return { blocks: rawBlocks, pageHeight };
  }

  private postProcessAllPages(
    pageBlocks: TextBlock[][],
    pageHeights: number[],
  ): TextBlock[][] {
    // Only detect headers/footers when there are multiple pages
    const headerFooterTexts =
      pageBlocks.length >= MIN_REPEAT_PAGES
        ? this.detectHeaderFooterTexts(pageBlocks, pageHeights)
        : new Set<string>();

    return pageBlocks.map((blocks) => {
      // 1. Remove header/footer blocks
      const filtered = blocks.filter(
        (b) => !headerFooterTexts.has(b.text),
      );

      // 2. Sort in reading order
      const sorted = this.sortBlocksInReadingOrder(filtered);

      // 3. Merge adjacent blocks
      return this.mergeAdjacentBlocks(sorted);
    });
  }

  async extractBlocks(fileBuffer: Buffer): Promise<TextBlock[]> {
    this.validateBuffer(fileBuffer);

    let pdf: {
      numPages: number;
      getPage: (n: number) => Promise<unknown>;
    };

    try {
      const pdfjsLib = getPdfjs();
      const data = new Uint8Array(fileBuffer);
      const loadingTask = pdfjsLib.getDocument({ data });
      pdf = (await loadingTask.promise) as typeof pdf;
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to parse PDF: ${(err as Error).message}`,
      );
    }

    const rawPageBlocks: TextBlock[][] = [];
    const pageHeights: number[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const { blocks, pageHeight } = await this.extractBlocksFromPage(
          page,
          pageNum,
        );
        rawPageBlocks.push(blocks);
        pageHeights.push(pageHeight);
      } catch (err) {
        if (
          err instanceof BadRequestException ||
          err instanceof InternalServerErrorException
        ) {
          throw err;
        }
        throw new InternalServerErrorException(
          `Failed to extract text from page ${pageNum}: ${(err as Error).message}`,
        );
      }
    }

    const processedPageBlocks = this.postProcessAllPages(rawPageBlocks, pageHeights);
    return processedPageBlocks.flat();
  }

  async extractBlocksByPages(
    fileBuffer: Buffer,
    pageRange?: string,
  ): Promise<TextBlock[][]> {
    this.validateBuffer(fileBuffer);

    let pdf: {
      numPages: number;
      getPage: (n: number) => Promise<unknown>;
    };

    try {
      const pdfjsLib = getPdfjs();
      const data = new Uint8Array(fileBuffer);
      const loadingTask = pdfjsLib.getDocument({ data });
      pdf = (await loadingTask.promise) as typeof pdf;
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to parse PDF: ${(err as Error).message}`,
      );
    }

    const pageNumbers =
      pageRange && pageRange.trim()
        ? this.parsePageRange(pageRange, pdf.numPages)
        : Array.from({ length: pdf.numPages }, (_, i) => i + 1);

    const rawPageBlocks: TextBlock[][] = [];
    const pageHeights: number[] = [];

    for (const pageNum of pageNumbers) {
      try {
        const page = await pdf.getPage(pageNum);
        const { blocks, pageHeight } = await this.extractBlocksFromPage(
          page,
          pageNum,
        );
        rawPageBlocks.push(blocks);
        pageHeights.push(pageHeight);
      } catch (err) {
        if (
          err instanceof BadRequestException ||
          err instanceof InternalServerErrorException
        ) {
          throw err;
        }
        throw new InternalServerErrorException(
          `Failed to extract text from page ${pageNum}: ${(err as Error).message}`,
        );
      }
    }

    return this.postProcessAllPages(rawPageBlocks, pageHeights);
  }
}
