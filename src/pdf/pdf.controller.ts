import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PdfService } from './pdf.service';
import { TranslatePdfDto } from './dto/translate-pdf.dto';
import { TranslationResultDto } from './dto/translation-result.dto';
import { TranslationProvider } from '../common/enums/translation-provider.enum';

@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @Post('translate')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE ?? '10485760') },
    }),
  )
  async translatePdf(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: parseInt(process.env.MAX_FILE_SIZE ?? '10485760'),
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() dto: TranslatePdfDto,
  ): Promise<TranslationResultDto> {
    return this.pdfService.translatePdf(file, dto);
  }

  @Get('supported-languages')
  async getSupportedLanguages(
    @Query('provider') provider?: TranslationProvider,
  ): Promise<string[]> {
    return this.pdfService.getSupportedLanguages(provider);
  }
}
