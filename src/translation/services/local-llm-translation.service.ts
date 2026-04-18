import * as fs from 'fs/promises';
import * as path from 'path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ITranslationService } from '../interfaces/translation-service.interface';
import { TranslationException } from '../../common/exceptions/translation.exception';
import { GlossaryService } from './glossary.service';
import { postProcessTranslation, splitIntoChunksWithOverlap } from '../utils/translation.utils';
import { mapWithConcurrency } from '../../common/utils/concurrency';

const MAX_CHUNK_SIZE = 2000;
const OVERLAP_SENTENCES = 1;
const DEFAULT_MODEL_PATH = 'assets/models/translateGemma.gguf';

@Injectable()
export class LocalLlmTranslationService implements ITranslationService {
  private readonly logger = new Logger(LocalLlmTranslationService.name);
  private session: { prompt: (text: string) => Promise<string> } | null = null;
  private readonly modelPath: string;

  constructor(private readonly glossaryService: GlossaryService) {
    this.modelPath =
      process.env.LOCAL_LLM_MODEL_PATH ??
      path.resolve(process.cwd(), DEFAULT_MODEL_PATH);
  }

  private async getSession(): Promise<{ prompt: (text: string) => Promise<string> }> {
    if (!this.session) {
      this.logger.log(`Loading local LLM model from: ${this.modelPath}`);

      // Dynamic import to avoid CJS require() issues with ESM top-level await in node-llama-cpp
      const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
      const llama = await getLlama();
      const model = await llama.loadModel({ modelPath: this.modelPath });
      const context = await model.createContext();
      this.session = new LlamaChatSession({
        contextSequence: context.getSequence(),
      });

      this.logger.log('Local LLM model loaded successfully');
    }
    return this.session;
  }

  private buildPrompt(text: string, sourceLang: string, targetLang: string): string {
    return (
      `Translate the following text from ${sourceLang} to ${targetLang}.\n` +
      `Return ONLY the translated text without any explanations.\n\n` +
      `${text}`
    );
  }

  private async translateChunk(
    chunk: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    const prompt = this.buildPrompt(chunk, sourceLang, targetLang);
    try {
      const session = await this.getSession();
      const result = await session.prompt(prompt);
      return result.trim();
    } catch (error) {
      throw new TranslationException(
        `Local LLM translation failed: ${(error as Error)?.message ?? 'Unknown error'}`,
      );
    }
  }

  async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (!text || !text.trim()) {
      throw new BadRequestException('Text to translate cannot be empty');
    }

    // Validate model file exists before attempting inference
    try {
      await fs.access(this.modelPath);
    } catch {
      throw new BadRequestException(`Model file not found: ${this.modelPath}`);
    }

    const chunks = splitIntoChunksWithOverlap(text, MAX_CHUNK_SIZE, OVERLAP_SENTENCES);
    const translatedChunks: string[] = [];

    for (const chunk of chunks) {
      const translated = await this.translateChunk(chunk, sourceLang, targetLang);
      translatedChunks.push(translated);
    }

    return postProcessTranslation(translatedChunks.join('\n\n'));
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    options?: { glossaryPath?: string },
  ): Promise<string[]> {
    const terms = options?.glossaryPath
      ? this.glossaryService.loadGlossary(options.glossaryPath)
      : {};
    const hasGlossary = options?.glossaryPath && Object.keys(terms).length > 0;

    return mapWithConcurrency(texts, 1, async (text) => {
      if (!hasGlossary) {
        return this.translate(text, sourceLang, targetLang);
      }
      const { text: substituted, placeholders } = this.glossaryService.substitute(text, terms);
      const translated = await this.translate(substituted, sourceLang, targetLang);
      return this.glossaryService.restore(translated, placeholders);
    });
  }

  async getSupportedLanguages(): Promise<string[]> {
    return Promise.resolve([]);
  }
}
