import { TranslationProvider } from '../../common/enums/translation-provider.enum';

export class TranslationResultDto {
  originalText!: string;
  translatedText!: string;
  sourceLang!: string;
  targetLang!: string;
  provider!: TranslationProvider;
}
