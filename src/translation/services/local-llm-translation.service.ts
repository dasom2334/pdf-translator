import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ITranslationService } from '../interfaces/translation-service.interface';
import { TranslationException } from '../../common/exceptions/translation.exception';
import { GlossaryService } from './glossary.service';
import { postProcessTranslation, splitIntoChunksWithOverlap } from '../utils/translation.utils';
import { mapWithConcurrency } from '../../common/utils/concurrency';

const execFileAsync = promisify(execFile);

const MAX_CHUNK_SIZE = 2000;
const OVERLAP_SENTENCES = 1;
const DEFAULT_MODEL_PATH = 'assets/models/translateGemma.gguf';

@Injectable()
export class LocalLlmTranslationService implements ITranslationService {
  private readonly logger = new Logger(LocalLlmTranslationService.name);
  private session: { prompt: (text: string) => Promise<string> } | null = null;
  private readonly modelPath: string;

  constructor(private readonly glossaryService: GlossaryService) {
    const modelPath = process.env.LOCAL_LLM_MODEL_PATH;
    if (!modelPath) {
      this.logger.warn(
        'LOCAL_LLM_MODEL_PATH not set. Using default path. Use --local-model to specify the model path explicitly.',
      );
    }
    this.modelPath = modelPath ?? path.resolve(process.cwd(), DEFAULT_MODEL_PATH);
  }

  private async getSession(): Promise<{ prompt: (text: string) => Promise<string> }> {
    if (this.session) {
      return this.session;
    }

    await this.ensureModelExists();
    this.logger.log(`Loading local LLM model from: ${this.modelPath}`);

    // TypeScript(module:commonjs)는 import()를 require()로 변환하므로
    // new Function을 사용해 변환을 우회하고 네이티브 ESM import() 유지
    const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<typeof import('node-llama-cpp')>;
    const { getLlama, LlamaChatSession } = await esmImport('node-llama-cpp');
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath: this.modelPath });
    const context = await model.createContext();
    this.session = new LlamaChatSession({
      contextSequence: context.getSequence(),
    });

    this.logger.log('Local LLM model loaded successfully');
    return this.session;
  }

  private async ensureModelExists(): Promise<void> {
    try {
      await fs.access(this.modelPath);
      return;
    } catch {
      // 파일 없음 → 자동 다운로드
    }

    const MODEL_URI =
      'hf:mradermacher/translategemma-12b-it-GGUF/translategemma-12b-it.Q4_K_M.gguf';
    const modelDir = path.dirname(this.modelPath);
    const modelFilename = path.basename(this.modelPath);

    this.logger.warn(`Model file not found at: ${this.modelPath}`);
    this.logger.log(`Downloading model (~7.3GB). This may take a while...`);

    try {
      await fs.mkdir(modelDir, { recursive: true });
      await execFileAsync(
        'npx',
        ['node-llama-cpp@3.18.1', 'pull', '--dir', modelDir, '--filename', modelFilename, MODEL_URI],
        { timeout: 60 * 60 * 1000 }, // 1시간
      );
      this.logger.log('Model downloaded successfully');
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      this.logger.error(`Model download failed: ${message}`);
      if (message.includes('ENOSPC')) {
        this.logger.error('Not enough disk space. Free up space and retry.');
      } else if (message.includes('ENOTFOUND') || message.includes('EAI_AGAIN')) {
        this.logger.error('Network error. Check your internet connection and retry.');
      } else if (message.includes('403') || message.includes('401')) {
        this.logger.error('Access denied. The model may require HuggingFace authentication.');
      }
      throw new TranslationException(
        `Model file not found and auto-download failed: ${message}`,
      );
    }
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
      if (error instanceof BadRequestException || error instanceof TranslationException) {
        throw error;
      }
      throw new TranslationException(
        `Local LLM translation failed: ${(error as Error)?.message ?? 'Unknown error'}`,
      );
    }
  }

  async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (!text || !text.trim()) {
      throw new BadRequestException('Text to translate cannot be empty');
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
