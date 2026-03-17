import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PdfModule } from '../pdf/pdf.module';
import { TranslationModule } from '../translation/translation.module';
import { TranslateCommand } from './commands/translate.command';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PdfModule,
    TranslationModule,
  ],
  providers: [TranslateCommand],
})
export class CliModule {}
