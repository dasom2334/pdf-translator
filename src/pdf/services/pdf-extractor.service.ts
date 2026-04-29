import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { IPdfExtractor, TextBlock } from '../interfaces';
import { getPdfjs } from '../utils/pdfjs-loader';

type PdfjsDoc = {
  numPages: number;
  getPage(n: number): Promise<unknown>;
  destroy(): Promise<void>;
};

// PDF magic bytes: %PDF
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];

/**
 * Threshold (as fraction of page height) used to detect header/footer zones.
 * Blocks within the top or bottom HEADER_FOOTER_RATIO of the page height are
 * candidates for header/footer detection.
 */
const HEADER_FOOTER_RATIO = 0.08;

/**
 * Minimum number of pages a text must appear on (at the same relative Y
 * position) to be classified as a repeating header/footer pattern.
 */
const HEADER_FOOTER_MIN_PAGE_COUNT = 2;

/**
 * Maximum allowed difference (in points) between two blocks' Y coordinates
 * for them to be considered on the same "line" during paragraph merging.
 */
const SAME_LINE_Y_TOLERANCE = 2;

/**
 * Maximum horizontal gap (in points) between two adjacent blocks on the same
 * line to be merged as a single paragraph.
 */
const MAX_MERGE_GAP = 20;

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
   * Normalize text: collapse multiple whitespace characters into a single
   * space and strip leading/trailing whitespace.
   */
  private normalizeText(text: string): string {
    // Replace control characters and multiple spaces/tabs with a single space
    return text.replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  /**
   * Sort TextBlocks in reading order: top-to-bottom (Y ascending), then
   * left-to-right (X ascending) within the same line.
   */
  private sortByReadingOrder(blocks: TextBlock[]): TextBlock[] {
    return [...blocks].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > SAME_LINE_Y_TOLERANCE) {
        return yDiff;
      }
      return a.x - b.x;
    });
  }

  /**
   * Build a "fingerprint" for header/footer detection: round Y to the nearest
   * 5-point bucket to tolerate minor positional variance across pages.
   */
  private yBucket(y: number): number {
    return Math.round(y / 5) * 5;
  }

  /**
   * Detect and remove blocks that appear to be repeating headers or footers.
   *
   * A block is considered a header/footer candidate if:
   *   1. Its Y coordinate is in the top or bottom HEADER_FOOTER_RATIO zone of
   *      the page.
   *   2. The same (normalized-text, yBucket) pair appears on at least
   *      HEADER_FOOTER_MIN_PAGE_COUNT distinct pages.
   */
  private removeHeadersFooters(
    blocksByPage: TextBlock[][],
    pageHeights: number[],
  ): TextBlock[][] {
    // Count how many pages each (text, yBucket) pair appears on (in H/F zones)
    const patternPageCount = new Map<string, Set<number>>();

    for (let pi = 0; pi < blocksByPage.length; pi++) {
      const pageHeight = pageHeights[pi] ?? 792;
      const headerThreshold = pageHeight * HEADER_FOOTER_RATIO;
      const footerThreshold = pageHeight * (1 - HEADER_FOOTER_RATIO);

      for (const block of blocksByPage[pi]) {
        const inHeaderZone = block.y < headerThreshold;
        const inFooterZone = block.y > footerThreshold;
        if (!inHeaderZone && !inFooterZone) {
          continue;
        }
        const key = `${this.normalizeText(block.text)}|${this.yBucket(block.y)}`;
        if (!patternPageCount.has(key)) {
          patternPageCount.set(key, new Set());
        }
        patternPageCount.get(key)!.add(block.page);
      }
    }

    // Build a set of keys that qualify as repeating headers/footers
    const repeatingKeys = new Set<string>();
    for (const [key, pages] of patternPageCount.entries()) {
      if (pages.size >= HEADER_FOOTER_MIN_PAGE_COUNT) {
        repeatingKeys.add(key);
      }
    }

    if (repeatingKeys.size === 0) {
      return blocksByPage;
    }

    return blocksByPage.map((blocks, pi) => {
      const pageHeight = pageHeights[pi] ?? 792;
      const headerThreshold = pageHeight * HEADER_FOOTER_RATIO;
      const footerThreshold = pageHeight * (1 - HEADER_FOOTER_RATIO);

      return blocks.filter((block) => {
        const inHeaderZone = block.y < headerThreshold;
        const inFooterZone = block.y > footerThreshold;
        if (!inHeaderZone && !inFooterZone) {
          return true;
        }
        const key = `${this.normalizeText(block.text)}|${this.yBucket(block.y)}`;
        return !repeatingKeys.has(key);
      });
    });
  }

  /**
   * Merge adjacent TextBlocks on the same line into paragraph blocks.
   *
   * Two blocks are merged if:
   *   - They are on the same page.
   *   - Their Y coordinates differ by at most SAME_LINE_Y_TOLERANCE.
   *   - The horizontal gap between the right edge of the left block and the
   *     left edge of the right block is at most MAX_MERGE_GAP.
   */
  private mergeAdjacentBlocks(blocks: TextBlock[]): TextBlock[] {
    if (blocks.length === 0) {
      return [];
    }

    const result: TextBlock[] = [];
    let current: TextBlock = { ...blocks[0] };

    for (let i = 1; i < blocks.length; i++) {
      const next = blocks[i];

      const samePage = current.page === next.page;
      const sameLineY =
        Math.abs(current.y - next.y) <= SAME_LINE_Y_TOLERANCE;
      const currentRight = current.x + current.width;
      const gap = next.x - currentRight;
      const closeEnough = gap >= 0 && gap <= MAX_MERGE_GAP;

      if (samePage && sameLineY && closeEnough) {
        // Merge: extend the current block
        const mergedText =
          this.normalizeText(current.text) +
          ' ' +
          this.normalizeText(next.text);
        const newRight = Math.max(currentRight, next.x + next.width);
        const newTop = Math.min(current.y, next.y);
        const newBottom = Math.max(
          current.y + current.height,
          next.y + next.height,
        );

        current = {
          ...current,
          text: mergedText,
          y: newTop,
          width: newRight - current.x,
          height: newBottom - newTop,
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
      const text = this.normalizeText(rawText);
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
      const itemHeight = item.height || fontSize;
      const y = pageHeight - pdfY - itemHeight;

      const block: TextBlock = {
        text,
        page: pageNumber,
        x,
        y,
        width: item.width ?? 0,
        height: itemHeight,
        fontSize: Math.round(fontSize * 100) / 100,
        fontName: item.fontName ?? '',
      };

      blocks.push(block);
    }

    return { blocks, pageHeight };
  }

  /**
   * Post-process raw TextBlocks from all pages:
   * 1. Sort each page's blocks in reading order (Y then X).
   * 2. Remove repeating header/footer patterns across pages.
   * 3. Merge adjacent blocks on the same line into paragraph blocks.
   */
  private postProcessBlocks(
    blocksByPage: TextBlock[][],
    pageHeights: number[],
  ): TextBlock[][] {
    // Step 1: sort each page in reading order
    const sorted = blocksByPage.map((blocks) =>
      this.sortByReadingOrder(blocks),
    );

    // Step 2: remove headers/footers (only when there are multiple pages)
    const filtered =
      sorted.length >= HEADER_FOOTER_MIN_PAGE_COUNT
        ? this.removeHeadersFooters(sorted, pageHeights)
        : sorted;

    // Step 3: merge adjacent blocks
    return filtered.map((blocks) => this.mergeAdjacentBlocks(blocks));
  }

  /**
   * PDF 버퍼를 파싱하여 pdfjs 문서 인스턴스를 반환한다.
   * 오류 시 InternalServerErrorException으로 래핑한다.
   */
  private async loadPdf(fileBuffer: Buffer): Promise<PdfjsDoc> {
    this.validateBuffer(fileBuffer);
    try {
      const pdfjsLib = getPdfjs();
      const data = new Uint8Array(fileBuffer);
      return (await pdfjsLib.getDocument({ data }).promise) as PdfjsDoc;
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to parse PDF: ${(err as Error).message}`,
      );
    }
  }

  /**
   * 지정된 페이지 번호 목록에서 TextBlock을 추출한다.
   * try/finally로 pdf.destroy()를 보장하여 메모리 누수를 방지한다.
   */
  private async extractRawPages(
    pdf: PdfjsDoc,
    pageNums: number[],
  ): Promise<{ blocksByPage: TextBlock[][]; pageHeights: number[] }> {
    const blocksByPage: TextBlock[][] = [];
    const pageHeights: number[] = [];
    try {
      for (const pageNum of pageNums) {
        try {
          const page = await pdf.getPage(pageNum);
          const { blocks, pageHeight } = await this.extractBlocksFromPage(
            page,
            pageNum,
          );
          blocksByPage.push(blocks);
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
    } finally {
      await pdf.destroy();
    }
    return { blocksByPage, pageHeights };
  }

  async extractBlocks(fileBuffer: Buffer): Promise<TextBlock[]> {
    const pdf = await this.loadPdf(fileBuffer);
    const pageNums = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    const { blocksByPage, pageHeights } = await this.extractRawPages(pdf, pageNums);
    return this.postProcessBlocks(blocksByPage, pageHeights).flat();
  }

  async extractBlocksByPages(
    fileBuffer: Buffer,
    pageRange?: string,
  ): Promise<TextBlock[][]> {
    const pdf = await this.loadPdf(fileBuffer);
    const pageNums =
      pageRange?.trim()
        ? this.parsePageRange(pageRange, pdf.numPages)
        : Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    const { blocksByPage, pageHeights } = await this.extractRawPages(pdf, pageNums);
    return this.postProcessBlocks(blocksByPage, pageHeights);
  }
}
