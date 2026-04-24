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

/**
 * 1회 번역 텍스트 최대 길이 (문자 수).
 * 프롬프트 오버헤드(~100 토큰) + 입력 + 출력이 CONTEXT_SIZE 안에 들어와야 한다.
 * CONTEXT_SIZE=1024일 때: 1500자 ÷ 4 ≈ 375 토큰 입력 + 375 토큰 출력 + 100 = 850 토큰 → 안전.
 */
const MAX_CHUNK_SIZE = 1500;
const OVERLAP_SENTENCES = 1;
const DEFAULT_MODEL_PATH = 'assets/models/translateGemma.gguf';

/**
 * 프롬프트 + 응답 1회에 충분한 컨텍스트 크기 (토큰).
 * 2048 → 1024: KV 캐시 Metal 버퍼 절반 감소 (~1.2GB → ~600MB).
 */
const CONTEXT_SIZE = 1024;

/**
 * 번역 응답 최대 토큰 수.
 * 출력 길이를 제한해 KV 캐시 사용량과 inference 시간을 줄인다.
 */
const MAX_RESPONSE_TOKENS = 512;

const LANG_NAMES: Record<string, string> = {
  auto: 'English', en: 'English', ko: 'Korean', ja: 'Japanese',
  zh: 'Chinese', fr: 'French', de: 'German', es: 'Spanish',
  pt: 'Portuguese', ru: 'Russian', ar: 'Arabic', it: 'Italian',
};

type NodeLlamaCppLib = typeof import('node-llama-cpp');

@Injectable()
export class LocalLlmTranslationService implements ITranslationService, OnModuleDestroy {
  private readonly logger = new Logger(LocalLlmTranslationService.name);

  // 무거운 리소스 — lazy init + 싱글톤. native 메모리를 보유하므로 반드시 dispose 필요.
  private llama: any = null; // node-llama-cpp 타입은 ESM-only라 any 사용
  private model: any = null;
  private context: any = null;
  // LlamaCompletion: LlamaChatSession 대신 raw completion API 사용.
  //   - 채팅 래퍼(Jinja 템플릿) 오버헤드 없음
  //   - 매 블록 sequence.clearHistory()로 KV 캐시 정리 → context 재생성 불필요
  //   - context 재생성이 없으므로 Metal 2× 스파이크 원천 차단
  private LlamaCompletion: NodeLlamaCppLib['LlamaCompletion'] | null = null;
  private sequence: any = null;
  private completion: any = null;

  constructor(private readonly glossaryService: GlossaryService) {}

  /**
   * 모델 경로를 lazy하게 반환한다.
   * 생성자가 아닌 loadResources() 시점에 읽으므로, CLI run()에서
   * process.env.LOCAL_LLM_MODEL_PATH를 설정한 뒤에도 올바른 경로를 사용한다.
   * (NestJS DI는 CommandFactory.run() 이전에 생성자를 실행하므로 생성자에서 읽으면 값이 없다.)
   */
  private get effectiveModelPath(): string {
    return process.env.LOCAL_LLM_MODEL_PATH ?? path.resolve(process.cwd(), DEFAULT_MODEL_PATH);
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

    if (!process.env.LOCAL_LLM_MODEL_PATH) {
      this.logger.warn(
        'LOCAL_LLM_MODEL_PATH not set. Using default path. Use --local-model to specify the model path explicitly.',
      );
    }
    await this.ensureModelExists();
    this.logger.log(`Loading local LLM model from: ${this.effectiveModelPath}`);

    const lib = await this.importNodeLlamaCpp();

    this.llama = await lib.getLlama();

    // gpuLayers 결정: --gpu-layers 명시 → 그 값, 없으면 가용 VRAM 50% 목표로 자동 계산
    const gpuLayersEnv = process.env.LOCAL_LLM_GPU_LAYERS;
    const gpuLayers: number | 'auto' =
      gpuLayersEnv !== undefined
        ? parseInt(gpuLayersEnv, 10)
        : await this.resolveHalfLayers(lib);

    this.model = await this.llama.loadModel({ modelPath: this.effectiveModelPath, gpuLayers });

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
    this.LlamaCompletion = lib.LlamaCompletion;

    // sequence와 completion은 프로세스 전체에서 1개만 생성.
    // 매 번역 전 sequence.clearHistory()로 KV 캐시를 초기화해 재사용한다.
    // context 재생성 없이 KV 캐시만 비우므로 Metal 메모리 스파이크가 발생하지 않는다.
    this.sequence = this.context.getSequence();
    this.completion = new this.LlamaCompletion({ contextSequence: this.sequence });

    this.logger.log('Local LLM model loaded successfully');
  }

  /**
   * 모델 총 레이어 수의 50%를 기본 GPU 레이어로 계산한다.
   * GPU가 없으면 0을 반환.
   *
   * 전략:
   *   1. readGgufFileInfo로 GGUF 헤더만 읽어 총 레이어 수 파악 (가중치 로드 없음, 빠름)
   *   2. GPU 없으면 0 반환, 있으면 Math.floor(totalLayers / 2) 반환 (50%)
   *   3. 계산 실패 시 'auto' 폴백
   */
  private async resolveHalfLayers(lib: NodeLlamaCppLib): Promise<number | 'auto'> {
    try {
      // GGUF 헤더 파싱으로 총 레이어 수 획득 (가중치 로드 없음)
      const fileInfo = await lib.readGgufFileInfo(this.effectiveModelPath);
      const totalLayers: number = (fileInfo.architectureMetadata as any)?.block_count ?? 0;
      if (totalLayers <= 0) return 'auto';

      // GPU 존재 여부 확인
      const vramState = await this.llama.getVramState();
      if (vramState.total <= 0) return 0; // GPU 없음 → CPU 전용

      const halfLayers = Math.floor(totalLayers / 2);
      this.logger.log(`GPU auto-config: ${halfLayers}/${totalLayers} layers (50% of model)`);
      return halfLayers;
    } catch {
      return 'auto';
    }
  }

  /**
   * NestJS 앱 종료 시 native 리소스(llama.cpp C++ 힙)를 순서대로 해제한다.
   * completion → sequence → context → model → llama 순서로 해제해야 dangling pointer가 발생하지 않는다.
   */
  async onModuleDestroy(): Promise<void> {
    try {
      if (this.completion) {
        await this.completion.dispose?.();
        this.completion = null;
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
      await fs.access(this.effectiveModelPath);
      return;
    } catch {
      // 파일 없음 → 자동 다운로드
    }

    const MODEL_URI =
      'hf:mradermacher/translategemma-12b-it-GGUF/translategemma-12b-it.Q4_K_M.gguf';
    const modelDir = path.dirname(this.effectiveModelPath);
    const modelFilename = path.basename(this.effectiveModelPath);

    this.logger.warn(`Model file not found at: ${this.effectiveModelPath}`);
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

  private async translateChunk(
    chunk: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    await this.loadResources();

    // 매 블록 전 KV 캐시를 초기화한다.
    // clearHistory()는 C++ KV 캐시를 직접 비우므로 Metal 버퍼 재할당 없이 메모리를 재사용한다.
    // context 재생성을 하지 않으므로 Metal 2× 스파이크가 발생하지 않는다.
    await this.sequence.clearHistory();

    try {
      const result = await this.completion.generateCompletion(
        this.buildPrompt(chunk, sourceLang, targetLang),
        { maxTokens: MAX_RESPONSE_TOKENS },
      );
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
