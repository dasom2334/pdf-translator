import { Injectable } from '@nestjs/common';
import { TranslationServiceFactory } from '../translation/factories/translation-service.factory';
import { TranslatePdfDto } from './dto/translate-pdf.dto';
import { TranslationResultDto } from './dto/translation-result.dto';

@Injectable()
export class PdfService {
  constructor(
    private readonly translationServiceFactory: TranslationServiceFactory,
  ) {}

  translatePdf(_dto: TranslatePdfDto): Promise<TranslationResultDto> {
    throw new Error('Not implemented');
  }

  getSupportedLanguages(): Promise<string[]> {
    throw new Error('Not implemented');
  }
}
