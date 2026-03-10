import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { TranslationServiceFactory } from '../translation/factories/translation-service.factory';
import { TranslatePdfDto } from './dto/translate-pdf.dto';
import { TranslationResultDto } from './dto/translation-result.dto';
import { TranslationProvider } from '../common/enums/translation-provider.enum';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse') as {
  PDFParse: new (params: { data: Buffer | ArrayBuffer }) => {
    getText(): Promise<{
      text: string;
      pages: Array<{ num: number; text: string }>;
      total: number;
    }>;
    destroy(): Promise<void>;
  };
};

function validatePdfBuffer(fileBuffer: Buffer): void {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new BadRequestException('File buffer is empty');
  }
  const magic = fileBuffer.slice(0, 4);
  if (
    magic[0] !== 0x25 ||
    magic[1] !== 0x50 ||
    magic[2] !== 0x44 ||
    magic[3] !== 0x46
  ) {
    throw new BadRequestException('File is not a valid PDF');
  }
}

@Injectable()
export class PdfService {
  constructor(
    private readonly translationServiceFactory: TranslationServiceFactory,
  ) {}

  async extractText(fileBuffer: Buffer): Promise<string> {
    validatePdfBuffer(fileBuffer);
    const parser = new PDFParse({ data: fileBuffer });
    try {
      const result = await parser.getText();
      return result.text;
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await parser.destroy();
    }
  }

  async extractTextByPages(fileBuffer: Buffer): Promise<string[]> {
    validatePdfBuffer(fileBuffer);
    const parser = new PDFParse({ data: fileBuffer });
    try {
      const result = await parser.getText();
      return result.pages.map((page) => page.text);
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to extract text by pages from PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await parser.destroy();
    }
  }

  async translatePdf(
    file: Express.Multer.File,
    dto: TranslatePdfDto,
  ): Promise<TranslationResultDto> {
    const text = await this.extractText(file.buffer);
    const provider = dto.provider ?? TranslationProvider.DEEPL;
    const translationService =
      this.translationServiceFactory.getService(provider);
    const translatedText = await translationService.translate(
      text,
      dto.sourceLang,
      dto.targetLang,
    );
    const result = new TranslationResultDto();
    result.originalText = text;
    result.translatedText = translatedText;
    result.sourceLang = dto.sourceLang;
    result.targetLang = dto.targetLang;
    result.provider = provider;
    return result;
  }

  async getSupportedLanguages(
    provider?: TranslationProvider,
  ): Promise<string[]> {
    const resolvedProvider = provider ?? TranslationProvider.DEEPL;
    const translationService =
      this.translationServiceFactory.getService(resolvedProvider);
    return translationService.getSupportedLanguages();
  }
}
