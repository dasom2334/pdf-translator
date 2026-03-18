import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { IPdfExtractor } from '../interfaces';
import * as pdfParse from 'pdf-parse';

@Injectable()
export class PdfExtractorService implements IPdfExtractor {
  async extractText(fileBuffer: Buffer): Promise<string> {
    this.validatePdf(fileBuffer);
    try {
      const data = await pdfParse(fileBuffer);
      return data.text;
    } catch (err) {
      throw new InternalServerErrorException(`Failed to parse PDF: ${(err as Error).message}`);
    }
  }

  async extractTextByPages(fileBuffer: Buffer, pageRange?: string): Promise<string[]> {
    this.validatePdf(fileBuffer);
    const pages: string[] = [];
    try {
      await pdfParse(fileBuffer, {
        pagerender: (pageData) => {
          return pageData.getTextContent().then((textContent: { items: Array<{ str: string }> }) => {
            const pageText = textContent.items.map((item) => item.str).join(' ');
            pages.push(pageText);
            return pageText;
          });
        },
      });
      const allPages = pages.length > 0 ? pages : [(await pdfParse(fileBuffer)).text];
      if (!pageRange) {
        return allPages;
      }
      const indices = this.parsePageRange(pageRange, allPages.length);
      return indices.map((i) => allPages[i]);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new InternalServerErrorException(`Failed to parse PDF pages: ${(err as Error).message}`);
    }
  }

  parsePageRange(pageRange: string, totalPages: number): number[] {
    const indices: number[] = [];
    const parts = pageRange.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
          throw new BadRequestException(`Invalid page range: "${trimmed}"`);
        }
        for (let i = start; i <= Math.min(end, totalPages); i++) {
          indices.push(i - 1);
        }
      } else {
        const page = parseInt(trimmed, 10);
        if (isNaN(page) || page < 1) {
          throw new BadRequestException(`Invalid page number: "${trimmed}"`);
        }
        if (page <= totalPages) {
          indices.push(page - 1);
        }
      }
    }
    return indices;
  }

  private validatePdf(fileBuffer: Buffer): void {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('File buffer is empty');
    }
    if (
      fileBuffer[0] !== 0x25 ||
      fileBuffer[1] !== 0x50 ||
      fileBuffer[2] !== 0x44 ||
      fileBuffer[3] !== 0x46
    ) {
      throw new BadRequestException('File is not a valid PDF');
    }
  }
}
