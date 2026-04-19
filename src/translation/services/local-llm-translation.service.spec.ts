import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LocalLlmTranslationService } from './local-llm-translation.service';
import { GlossaryService } from './glossary.service';
import { TranslationException } from '../../common/exceptions/translation.exception';

// vi.hoisted를 사용해 vi.mock 팩토리보다 먼저 초기화되도록 한다.
const { mockPrompt, mockExecFile } = vi.hoisted(() => {
  const mockPrompt = vi.fn().mockResolvedValue('translated text');
  const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
  return { mockPrompt, mockExecFile };
});

// Mock node-llama-cpp — native module, cannot use real binaries in tests.
// Dynamic import 패턴을 사용하므로 vi.mock으로 모듈 전체를 교체한다.
vi.mock('node-llama-cpp', () => {
  const MockLlamaChatSession = vi.fn().mockImplementation(() => ({
    prompt: mockPrompt,
  }));

  const mockGetLlama = vi.fn().mockResolvedValue({
    loadModel: vi.fn().mockResolvedValue({
      createContext: vi.fn().mockResolvedValue({
        getSequence: vi.fn().mockReturnValue({}),
      }),
    }),
  });

  return {
    getLlama: mockGetLlama,
    LlamaChatSession: MockLlamaChatSession,
  };
});

// Mock child_process.execFile — createModelDownloader 대신 npx node-llama-cpp pull 사용
vi.mock('child_process', () => ({
  execFile: mockExecFile,
}));

// Mock fs/promises for model file existence checks
vi.mock('fs/promises');

import { getLlama } from 'node-llama-cpp';
import * as fsPromises from 'fs/promises';

describe('LocalLlmTranslationService', () => {
  let service: LocalLlmTranslationService;
  let glossaryService: GlossaryService;

  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: model file exists
    vi.mocked(fsPromises.access).mockResolvedValue(undefined);
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);

    // Default: execFile (npx node-llama-cpp pull) succeeds
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === 'function') {
        callback(null, '', '');
      }
      return {} as ReturnType<typeof import('child_process').execFile>;
    });

    // Default getLlama setup
    vi.mocked(getLlama).mockResolvedValue({
      loadModel: vi.fn().mockResolvedValue({
        createContext: vi.fn().mockResolvedValue({
          getSequence: vi.fn().mockReturnValue({}),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof getLlama>>);

    // Default prompt returns 'translated text'
    mockPrompt.mockResolvedValue('translated text');

    process.env = { ...originalEnv };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GlossaryService, LocalLlmTranslationService],
    }).compile();

    service = module.get<LocalLlmTranslationService>(LocalLlmTranslationService);
    glossaryService = module.get<GlossaryService>(GlossaryService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('translate', () => {
    it('정상 번역 반환 — mock session.prompt가 번역 텍스트를 반환한다', async () => {
      mockPrompt.mockResolvedValueOnce('안녕하세요');

      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕하세요');
    });

    it('빈 텍스트 → BadRequestException 발생', async () => {
      await expect(service.translate('', 'en', 'ko')).rejects.toThrow(BadRequestException);
    });

    it('공백만 있는 텍스트 → BadRequestException 발생', async () => {
      await expect(service.translate('   ', 'en', 'ko')).rejects.toThrow(BadRequestException);
    });

    it('모델 파일 없고 자동 다운로드도 실패 → TranslationException 발생 (메시지에 Model file not found and auto-download failed 포함)', async () => {
      vi.mocked(fsPromises.access).mockRejectedValue(new Error('ENOENT'));
      // promisify(execFile)가 reject하도록 callback 기반 mock을 에러로 설정
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        if (typeof callback === 'function') {
          callback(new Error('ENOTFOUND'), '', '');
        }
        return {} as ReturnType<typeof import('child_process').execFile>;
      });

      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(
        'Model file not found and auto-download failed',
      );
    });

    it('모델 파일 없지만 자동 다운로드 성공 → 번역 진행됨', async () => {
      // 첫 번째 access는 실패(파일 없음), npx 다운로드 성공 후 getLlama 호출
      vi.mocked(fsPromises.access).mockRejectedValue(new Error('ENOENT'));
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        if (typeof callback === 'function') {
          callback(null, '', '');
        }
        return {} as ReturnType<typeof import('child_process').execFile>;
      });

      mockPrompt.mockResolvedValueOnce('안녕하세요');

      const result = await service.translate('Hello', 'en', 'ko');
      expect(result).toBe('안녕하세요');
    });

    it('추론 중 오류 → TranslationException 발생', async () => {
      mockPrompt.mockRejectedValueOnce(new Error('Inference error'));

      await expect(service.translate('Hello', 'en', 'ko')).rejects.toThrow(TranslationException);
    });

    it('프롬프트에 sourceLang과 targetLang이 포함된다', async () => {
      mockPrompt.mockResolvedValueOnce('Hola');

      await service.translate('Hello', 'en', 'es');

      const callArg = mockPrompt.mock.calls[0][0] as string;
      expect(callArg).toContain('en');
      expect(callArg).toContain('es');
    });
  });

  describe('Lazy init', () => {
    it('두 번 translate() 호출 시 getLlama가 1번만 호출된다', async () => {
      mockPrompt.mockResolvedValue('번역됨');

      await service.translate('Hello', 'en', 'ko');
      await service.translate('World', 'en', 'ko');

      expect(getLlama).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSupportedLanguages', () => {
    it('빈 배열을 반환한다', async () => {
      const result = await service.getSupportedLanguages();
      expect(result).toEqual([]);
    });
  });

  describe('translateBatch', () => {
    it('여러 텍스트를 직렬로 번역한다', async () => {
      const translateSpy = vi.spyOn(service, 'translate');
      translateSpy
        .mockResolvedValueOnce('안녕하세요')
        .mockResolvedValueOnce('세계');

      const results = await service.translateBatch(['Hello', 'World'], 'en', 'ko');
      expect(results).toEqual(['안녕하세요', '세계']);
      expect(translateSpy).toHaveBeenCalledTimes(2);
    });

    it('빈 배열 → 빈 배열 반환', async () => {
      const results = await service.translateBatch([], 'en', 'ko');
      expect(results).toEqual([]);
    });

    it('concurrency=1로 순서가 유지된다', async () => {
      const order: number[] = [];
      const translateSpy = vi.spyOn(service, 'translate');
      translateSpy.mockImplementation(async (text) => {
        order.push(parseInt(text));
        return `번역${text}`;
      });

      const texts = ['1', '2', '3'];
      const results = await service.translateBatch(texts, 'en', 'ko');

      expect(results).toEqual(['번역1', '번역2', '번역3']);
      expect(order).toEqual([1, 2, 3]);
    });

    it('glossaryPath 제공 시 용어집 치환·복원이 적용된다', async () => {
      vi.spyOn(glossaryService, 'loadGlossary').mockReturnValue({ Google: 'Google' });

      let capturedPlaceholder: string;
      vi.spyOn(glossaryService, 'substitute').mockImplementation((text, terms) => {
        capturedPlaceholder = '\x00GTERM_test-uuid\x00';
        const placeholders = new Map([[capturedPlaceholder, (terms as Record<string, string>)['Google']]]);
        return { text: text.replace('Google', capturedPlaceholder), placeholders };
      });
      vi.spyOn(glossaryService, 'restore').mockImplementation((text, placeholders) => {
        let result = text;
        for (const [ph, original] of placeholders.entries()) {
          result = result.replaceAll(ph, original);
        }
        return result;
      });

      const translateSpy = vi.spyOn(service, 'translate').mockResolvedValueOnce(
        '\x00GTERM_test-uuid\x00에 오신 것을 환영합니다',
      );

      const results = await service.translateBatch(
        ['Welcome to Google'],
        'en',
        'ko',
        { glossaryPath: '/fake/glossary.json' },
      );

      expect(results[0]).toBe('Google에 오신 것을 환영합니다');
      // translate가 호출될 때 원본 'Google'이 아닌 placeholder가 전달됐는지 검증
      expect(translateSpy.mock.calls[0][0]).not.toContain('Google');
    });
  });
});
