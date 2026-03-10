import { Controller, Post, Get, Body } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { TranslatePdfDto } from './dto/translate-pdf.dto';
import { TranslationResultDto } from './dto/translation-result.dto';

@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @Post('translate')
  translatePdf(@Body() _dto: TranslatePdfDto): Promise<TranslationResultDto> {
    throw new Error('Not implemented');
  }

  @Get('supported-languages')
  getSupportedLanguages(): Promise<string[]> {
    throw new Error('Not implemented');
  }
}
