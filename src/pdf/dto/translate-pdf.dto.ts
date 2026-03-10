import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';

export class TranslatePdfDto {
  @IsString()
  sourceLang: string;

  @IsString()
  targetLang: string;

  @IsOptional()
  @IsEnum(TranslationProvider)
  provider?: TranslationProvider;
}
