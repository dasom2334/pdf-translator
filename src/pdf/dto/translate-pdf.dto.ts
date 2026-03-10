import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';

export class TranslatePdfDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 5)
  sourceLang: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 5)
  targetLang: string;

  @IsOptional()
  @IsEnum(TranslationProvider)
  provider?: TranslationProvider;
}
