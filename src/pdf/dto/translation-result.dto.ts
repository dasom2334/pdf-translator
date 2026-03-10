import { IsEnum, IsString } from 'class-validator';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';

export class TranslationResultDto {
  @IsString()
  originalText: string;

  @IsString()
  translatedText: string;

  @IsString()
  sourceLang: string;

  @IsString()
  targetLang: string;

  @IsEnum(TranslationProvider)
  provider: TranslationProvider;
}
