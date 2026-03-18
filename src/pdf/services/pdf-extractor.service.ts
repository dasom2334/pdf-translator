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

  async extractTextByPages(fileBuffer: Buffer): Promise<string[]> {
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
      return pages.length > 0 ? pages : [(await pdfParse(fileBuffer)).text];
    } catch (err) {
      throw new InternalServerErrorException(`Failed to parse PDF pages: ${(err as Error).message}`);
    }
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
