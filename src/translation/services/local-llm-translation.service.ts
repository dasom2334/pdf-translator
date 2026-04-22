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

/** 프롬프트 + 응답 1회에 충분한 컨텍스트 크기 (토큰). */
const CONTEXT_SIZE = 2048;

/**
 * N 블록마다 context 전체를 dispose + 재생성한다.
 * Metal/CUDA 커맨드 버퍼는 context 수명에 묶여 있어 clearHistory()만으로는 해제 안 됨.
 * 이 값을 초과할 때마다 강제 해제 → 메모리 안정화.
 * Apple Silicon 통합 메모리에서 Metal 작업 버퍼가 누적되어 OOM을 유발할 수 있으므로
 * 빈도를 높여(5블록마다) Metal flush를 자주 수행한다.
 */
const CONTEXT_REFRESH_EVERY = 5;

const LANG_NAMES: Record<string, string> = {
  auto: 'English', en: 'English', ko: 'Korean', ja: 'Japanese',
  zh: 'Chinese', fr: 'French', de: 'German', es: 'Spanish',
  pt: 'Portuguese', ru: 'Russian', ar: 'Arabic', it: 'Italian',
};

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
  // sequence와 session 각각 보관:
  //   session.resetChatHistory() → JS 히스토리만 초기화
  //   sequence.clearHistory()    → C++ KV cache 실제 플러시 (메모리 릭 방지 핵심)
  private sequence: any = null;
  private session: any = null;
  private blockCount = 0;

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
   * node-llama-cpp를 ESM import로 로드한다.
   * TypeScript(module:commonjs)는 import()를 require()로 변환하므로
   * new Function을 사용해 변환을 우회하고 네이티브 ESM import() 유지.
   * protected로 선언해 테스트에서 spy를 통해 native 모듈 로드를 우회할 수 있다.
   */
  protected async importNodeLlamaCpp(): Promise<NodeLlamaCppLib> {
    const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<NodeLlamaCppLib>;
    return esmImport('node-llama-cpp');
  }

  /**
   * llama / model / context를 lazy init으로 로드한다.
   * 모델 로드는 최초 1회만 수행하고 이후에는 캐시된 인스턴스를 반환한다.
   */
  private async loadResources(): Promise<void> {
    if (this.llama) return;

    await this.ensureModelExists();
    this.logger.log(`Loading local LLM model from: ${this.modelPath}`);

    const lib = await this.importNodeLlamaCpp();

    this.llama = await lib.getLlama();

    // gpuLayers 결정: --gpu-layers 명시 → 그 값, 없으면 가용 VRAM 50% 목표로 자동 계산
    const gpuLayersEnv = process.env.LOCAL_LLM_GPU_LAYERS;
    const gpuLayers: number | 'auto' =
      gpuLayersEnv !== undefined
        ? parseInt(gpuLayersEnv, 10)
        : await this.resolveHalfLayers(lib);

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

    // 세션은 1개만 생성. chunk마다 resetChatHistory()로 재사용 → sequence 고갈 방지
    this.sequence = this.context.getSequence();
    this.session = new this.LlamaChatSession({ contextSequence: this.sequence });

    this.logger.log('Local LLM model loaded successfully');
  }

  /**
   * 모델 총 레이어 수의 25%를 기본 GPU 레이어로 계산한다.
   *
   * Apple Silicon 통합 메모리에서는 모델 가중치 메모리는 GPU/CPU 비율과 무관하게 동일하지만,
   * Metal 커맨드 버퍼 / KV 캐시 / scratch 버퍼 등 추론 작업 메모리는 GPU 레이어 수에 비례한다.
   * 50%로 설정 시 18페이지(422블록) 규모에서 Metal 버퍼 누적으로 인한 OOM 및 강제 재부팅이
   * 발생했으므로, 25%로 줄여 Metal 작업 메모리를 절반으로 감소시킨다.
   * GPU가 없으면 0을 반환.
   *
   * 전략:
   *   1. readGgufFileInfo로 GGUF 헤더만 읽어 총 레이어 수 파악 (가중치 로드 없음, 빠름)
   *   2. GPU 없으면 0 반환, 있으면 Math.floor(totalLayers / 4) 반환 (25%)
   *   3. 계산 실패 시 'auto' 폴백
   */
  private async resolveHalfLayers(lib: NodeLlamaCppLib): Promise<number | 'auto'> {
    try {
      // GGUF 헤더 파싱으로 총 레이어 수 획득 (가중치 로드 없음)
      const fileInfo = await lib.readGgufFileInfo(this.modelPath);
      const totalLayers: number = (fileInfo.architectureMetadata as any)?.block_count ?? 0;
      if (totalLayers <= 0) return 'auto';

      // GPU 존재 여부 확인
      const vramState = await this.llama.getVramState();
      if (vramState.total <= 0) return 0; // GPU 없음 → CPU 전용

      const quarterLayers = Math.floor(totalLayers / 4);
      this.logger.log(`GPU auto-config: ${quarterLayers}/${totalLayers} layers (25% of model)`);
      return quarterLayers;
    } catch {
      return 'auto';
    }
  }

  /**
   * NestJS 앱 종료 시 native 리소스(llama.cpp C++ 힙)를 순서대로 해제한다.
   * context → model → llama 순서로 해제해야 dangling pointer가 발생하지 않는다.
   */
  async onModuleDestroy(): Promise<void> {
    try {
      if (this.session) {
        await this.session.dispose?.();
        this.session = null;
      }
      if (this.sequence) {
        await this.sequence.dispose?.();
        this.sequence = null;
      }
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
    const src = LANG_NAMES[sourceLang] ?? sourceLang;
    const tgt = LANG_NAMES[targetLang] ?? targetLang;
    return (
      `You are a professional translator.\n` +
      `Translate the following text from ${src} to ${tgt}.\n` +
      `Rules:\n` +
      `- Output ONLY the translated text\n` +
      `- Do NOT include the original text\n` +
      `- Do NOT add explanations, notes, or comments\n` +
      `- Preserve formatting and line breaks\n\n` +
      `Text:\n${text}\n\nTranslation:`
    );
  }

  /**
   * session/sequence/context를 dispose하고 재생성한다.
   * Metal 커맨드 버퍼는 context 수명에 묶여 clearHistory()만으로는 해제 안 되므로
   * CONTEXT_REFRESH_EVERY 블록마다 context 전체를 재생성해 강제 해제한다.
   */
  private async refreshContext(): Promise<void> {
    if (this.session) { await this.session.dispose?.(); this.session = null; }
    if (this.sequence) { await this.sequence.dispose?.(); this.sequence = null; }
    if (this.context) { await this.context.dispose?.(); this.context = null; }

    this.context = await this.model.createContext({ contextSize: CONTEXT_SIZE });
    this.sequence = this.context.getSequence();
    this.session = new this.LlamaChatSession!({ contextSequence: this.sequence });
    this.logger.log('Context refreshed (GPU buffer freed)');
  }

  private async translateChunk(
    chunk: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    await this.loadResources();

    // N 블록마다 context 전체 재생성 → Metal 버퍼 강제 해제
    this.blockCount++;
    if (this.blockCount % CONTEXT_REFRESH_EVERY === 0) {
      await this.refreshContext();
    } else {
      this.session.resetChatHistory();
      await this.sequence.clearHistory();
    }

    try {
      const result = await this.session.prompt(this.buildPrompt(chunk, sourceLang, targetLang));
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
