import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ITranslationService } from '../interfaces/translation-service.interface';
import { TranslationException } from '../../common/exceptions/translation.exception';
import { GlossaryService } from './glossary.service';
import { postProcessTranslation, splitIntoChunksWithOverlap } from '../utils/translation.utils';
import { mapWithConcurrency } from '../../common/utils/concurrency';

const execFileAsync = promisify(execFile);

const MAX_CHUNK_SIZE = 2000;
const OVERLAP_SENTENCES = 1;
const DEFAULT_MODEL_PATH = 'assets/models/translateGemma.gguf';

/** 프롬프트 + 응답 1회에 충분한 컨텍스트 크기 (토큰). 모델 최대값을 초과하지 않도록 설정. */
const CONTEXT_SIZE = 4096;

type NodeLlamaCppLib = typeof import('node-llama-cpp');

@Injectable()
export class LocalLlmTranslationService implements ITranslationService, OnModuleDestroy {
  private readonly logger = new Logger(LocalLlmTranslationService.name);
  private readonly modelPath: string;

  // 무거운 리소스 — lazy init + 싱글톤. native 메모리를 보유하므로 반드시 dispose 필요.
  private llama: any = null; // node-llama-cpp 타입은 ESM-only라 any 사용
  private model: any = null;
  private context: any = null;
  private LlamaChatSession: NodeLlamaCppLib['LlamaChatSession'] | null = null;

  constructor(private readonly glossaryService: GlossaryService) {
    const modelPath = process.env.LOCAL_LLM_MODEL_PATH;
    if (!modelPath) {
      this.logger.warn(
        'LOCAL_LLM_MODEL_PATH not set. Using default path. Use --local-model to specify the model path explicitly.',
      );
    }
    this.modelPath = modelPath ?? path.resolve(process.cwd(), DEFAULT_MODEL_PATH);
  }

  /**
   * llama / model / context를 lazy init으로 로드한다.
   * 모델 로드는 최초 1회만 수행하고 이후에는 캐시된 인스턴스를 반환한다.
   */
  private async loadResources(): Promise<void> {
    if (this.llama) return;

    await this.ensureModelExists();
    this.logger.log(`Loading local LLM model from: ${this.modelPath}`);

    // TypeScript(module:commonjs)는 import()를 require()로 변환하므로
    // new Function을 사용해 변환을 우회하고 네이티브 ESM import() 유지
    const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<NodeLlamaCppLib>;
    const lib = await esmImport('node-llama-cpp');

    this.llama = await lib.getLlama();

    // gpuLayers: --gpu-layers 옵션이 명시되면 그 값을, 없으면 "auto"(가용 VRAM 자동 감지)
    const gpuLayersEnv = process.env.LOCAL_LLM_GPU_LAYERS;
    const gpuLayers: number | 'auto' =
      gpuLayersEnv !== undefined ? parseInt(gpuLayersEnv, 10) : 'auto';

    this.model = await this.llama.loadModel({ modelPath: this.modelPath, gpuLayers });

    // 실제 로드된 GPU 레이어 수 로그
    const loadedGpuLayers: number | undefined = this.model.gpuLayers;
    if (loadedGpuLayers !== undefined) {
      this.logger.log(
        loadedGpuLayers > 0
          ? `GPU layers: ${loadedGpuLayers} (VRAM 활용)`
          : 'GPU layers: 0 (CPU only — GPU 없거나 VRAM 부족)',
      );
    }

    // contextSize를 명시적으로 지정 → 번역 1회 분량만 캐시, 과도한 VRAM/RAM 점유 방지
    this.context = await this.model.createContext({ contextSize: CONTEXT_SIZE });
    this.LlamaChatSession = lib.LlamaChatSession;

    this.logger.log('Local LLM model loaded successfully');
  }

  /**
   * NestJS 앱 종료 시 native 리소스(llama.cpp C++ 힙)를 순서대로 해제한다.
   * context → model → llama 순서로 해제해야 dangling pointer가 발생하지 않는다.
   */
  async onModuleDestroy(): Promise<void> {
    try {
      if (this.context) {
        await this.context.dispose?.();
        this.context = null;
      }
      if (this.model) {
        await this.model.dispose?.();
        this.model = null;
      }
      if (this.llama) {
        await this.llama.dispose?.();
        this.llama = null;
      }
    } catch (err) {
      this.logger.warn(`Resource cleanup warning: ${(err as Error)?.message}`);
    }
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
    await this.loadResources();

    // 청크마다 새 sequence를 발급받아 독립된 KV cache 슬롯을 사용한다.
    // → 이전 번역 히스토리가 컨텍스트 윈도우에 누적되지 않음.
    // → 사용 후 dispose()로 슬롯을 context pool에 반환.
    const sequence = this.context.getSequence();
    const session = new this.LlamaChatSession!({ contextSequence: sequence });

    try {
      const result = await session.prompt(this.buildPrompt(chunk, sourceLang, targetLang));
      return result.trim();
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof TranslationException) {
        throw error;
      }
      throw new TranslationException(
        `Local LLM translation failed: ${(error as Error)?.message ?? 'Unknown error'}`,
      );
    } finally {
      // KV cache 슬롯 반환 — 누락 시 context pool이 고갈되어 다음 getSequence()에서 hang
      await sequence.dispose?.();
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
