import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { IPdfExtractor, TextBlock } from '../interfaces';
import { getPdfjs } from '../utils/pdfjs-loader';

// PDF magic bytes: %PDF
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];

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

  private async extractBlocksFromPage(
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

      const text = item.str.trim();
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

    const allBlocks: TextBlock[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const blocks = await this.extractBlocksFromPage(page, pageNum);
        allBlocks.push(...blocks);
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

    if (allBlocks.length === 0) {
      throw new BadRequestException(
        'No text content found in the PDF document',
      );
    }

    return allBlocks;
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

    const result: TextBlock[][] = [];

    for (const pageNum of pageNumbers) {
      try {
        const page = await pdf.getPage(pageNum);
        const blocks = await this.extractBlocksFromPage(page, pageNum);
        result.push(blocks);
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

    return result;
  }
}
