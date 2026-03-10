import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as pdfParse from 'pdf-parse';
import { TranslationServiceFactory } from '../translation/factories/translation-service.factory';
import { TranslatePdfDto } from './dto/translate-pdf.dto';
import { TranslationResultDto } from './dto/translation-result.dto';
import { TranslationProvider } from '../common/enums/translation-provider.enum';

interface PdfData {
  text: string;
}

interface TextItem {
  str: string;
}

interface TextContent {
  items: TextItem[];
}

interface PageData {
  getTextContent(): Promise<TextContent>;
}

@Injectable()
export class PdfService {
  constructor(
    private readonly translationServiceFactory: TranslationServiceFactory,
  ) {}

  async extractText(fileBuffer: Buffer): Promise<string> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('File buffer is empty');
    }
    // Check PDF magic bytes
    if (fileBuffer.slice(0, 4).toString() !== '%PDF') {
      throw new BadRequestException('File is not a valid PDF');
    }
    try {
      const data = (await pdfParse(fileBuffer)) as PdfData;
      return data.text;
    } catch {
      throw new InternalServerErrorException('Failed to extract text from PDF');
    }
  }

  async extractTextByPages(fileBuffer: Buffer): Promise<string[]> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('File buffer is empty');
    }
    if (fileBuffer.slice(0, 4).toString() !== '%PDF') {
      throw new BadRequestException('File is not a valid PDF');
    }
    try {
      const pages: string[] = [];
      await pdfParse(fileBuffer, {
        pagerender: (pageData: PageData) => {
          return pageData.getTextContent().then((textContent: TextContent) => {
            const pageText = textContent.items
              .map((item) => item.str)
              .join(' ');
            pages.push(pageText);
            return pageText;
          });
        },
      });
      return pages;
    } catch {
      throw new InternalServerErrorException(
        'Failed to extract text by pages from PDF',
      );
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
