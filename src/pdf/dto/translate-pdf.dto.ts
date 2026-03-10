import { TranslationProvider } from '../../common/enums/translation-provider.enum';

export class TranslatePdfDto {
  sourceLang: string;
  targetLang: string;
  provider?: TranslationProvider;
}
