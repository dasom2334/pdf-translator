export interface ITranslationService {
  translate(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string>;
  translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
  ): Promise<string[]>;
  getSupportedLanguages(): Promise<string[]>;
}
