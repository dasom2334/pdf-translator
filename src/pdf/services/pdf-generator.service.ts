import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';
import { IPdfGenerator, PdfGenerateOptions } from '../interfaces';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const FONT_SIZE = 11;
const LINE_HEIGHT = 16;

@Injectable()
export class PdfGeneratorService implements IPdfGenerator {
  async generate(text: string, outputPath: string, options?: PdfGenerateOptions): Promise<void> {
    return this.generateFromPages([text], outputPath, options);
  }

  async generateFromPages(pages: string[], outputPath: string, options?: PdfGenerateOptions): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);

      const font = await this.loadFont(pdfDoc, options?.fontPath);
      const processedPages = options?.glossary
        ? pages.map((p) => this.applyGlossary(p, options.glossary!))
        : pages;

      for (const pageText of processedPages) {
        this.addPageToPdf(pdfDoc, pageText, font);
      }

      const pdfBytes = await pdfDoc.save();
      await fs.promises.writeFile(outputPath, pdfBytes);
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      throw new InternalServerErrorException(`Failed to generate PDF: ${(err as Error).message}`);
    }
  }

  async generateBilingual(
    originalPages: string[],
    translatedPages: string[],
    outputPath: string,
    options?: PdfGenerateOptions,
  ): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);

      const font = await this.loadFont(pdfDoc, options?.fontPath);
      const pageCount = Math.max(originalPages.length, translatedPages.length);

      for (let i = 0; i < pageCount; i++) {
        const originalText = originalPages[i] ?? '';
        const translatedText = options?.glossary
          ? this.applyGlossary(translatedPages[i] ?? '', options.glossary)
          : (translatedPages[i] ?? '');
        this.addPageToPdf(pdfDoc, originalText, font);
        this.addPageToPdf(pdfDoc, translatedText, font);
      }

      const pdfBytes = await pdfDoc.save();
      await fs.promises.writeFile(outputPath, pdfBytes);
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      throw new InternalServerErrorException(`Failed to generate bilingual PDF: ${(err as Error).message}`);
    }
  }

  private async loadFont(
    pdfDoc: PDFDocument,
    fontPath?: string,
  ): Promise<Awaited<ReturnType<PDFDocument['embedFont']>>> {
    const resolvedPath = fontPath ?? this.getDefaultFontPath();
    if (fs.existsSync(resolvedPath)) {
      const fontBytes = await fs.promises.readFile(resolvedPath);
      return pdfDoc.embedFont(fontBytes);
    }
    return pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  private addPageToPdf(
    pdfDoc: PDFDocument,
    pageText: string,
    font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  ): void {
    const pdfPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const maxWidth = PAGE_WIDTH - MARGIN * 2;
    const lines = this.wrapText(pageText, font, FONT_SIZE, maxWidth);
    let y = PAGE_HEIGHT - MARGIN;
    for (const line of lines) {
      if (y < MARGIN + LINE_HEIGHT) {
        const newPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
        newPage.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
      } else {
        pdfPage.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
      }
      y -= LINE_HEIGHT;
    }
  }

  private applyGlossary(text: string, glossary: Record<string, string>): string {
    let result = text;
    for (const [term, replacement] of Object.entries(glossary)) {
      result = result.split(term).join(replacement);
    }
    return result;
  }

  private wrapText(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, fontSize: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      const words = paragraph.split(' ');
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (font.widthOfTextAtSize(testLine, fontSize) <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine);
    }
    return lines;
  }

  private getDefaultFontPath(): string {
    return path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf');
  }
}
