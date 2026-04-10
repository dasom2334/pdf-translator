import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TranslateCommand } from './translate.command';
import {
  PDF_EXTRACTOR,
  PDF_OVERLAY_GENERATOR,
  PDF_REBUILD_GENERATOR,
  TextBlock,
} from '../../pdf/interfaces';
import { TranslationServiceFactory } from '../../translation/factories/translation-service.factory';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';
import { OutputMode } from '../../common/enums/output-mode.enum';
import * as fsPromises from 'fs/promises';
import * as fsSync from 'fs';

// cli-config.loader 모킹
vi.mock('../config/cli-config.loader', () => ({
  loadCliConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('pdf-data')),
}));

// 동기 fs 모킹 (parseInput/parseFont/parseGlossary 파일 존재 검증용)
vi.mock('fs', () => ({
  accessSync: vi.fn(), // 기본값: 예외 없음 = 파일 존재
  constants: { R_OK: 4 },
}));

const mockBlock: TextBlock = {
  text: 'Hello',
  page: 1,
  x: 0,
  y: 0,
  width: 100,
  height: 20,
  fontSize: 12,
  fontName: 'Helvetica',
};

const mockPdfExtractor = {
  extractBlocks: vi.fn(),
  extractBlocksByPages: vi.fn().mockResolvedValue([[{ ...mockBlock }]]),
};

const mockPdfOverlayGenerator = {
  overlay: vi.fn().mockResolvedValue(undefined),
};

const mockPdfRebuildGenerator = {
  rebuild: vi.fn().mockResolvedValue(undefined),
};

const mockTranslationService = {
  translate: vi.fn(),
  translateBatch: vi.fn().mockResolvedValue(['Hola']),
  getSupportedLanguages: vi.fn(),
};

const mockTranslationServiceFactory = {
  getService: vi.fn().mockReturnValue(mockTranslationService),
};

describe('TranslateCommand', () => {
  let module: TestingModule;
  let command: TranslateCommand;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-setup mocks after clearAllMocks
    (fsPromises.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      Buffer.from('pdf-data'),
    );
    mockPdfExtractor.extractBlocksByPages.mockResolvedValue([[{ ...mockBlock }]]);
    mockPdfOverlayGenerator.overlay.mockResolvedValue(undefined);
    mockPdfRebuildGenerator.rebuild.mockResolvedValue(undefined);
    mockTranslationService.translateBatch.mockResolvedValue(['Hola']);
    mockTranslationServiceFactory.getService.mockReturnValue(mockTranslationService);

    // loadCliConfig 기본값 재설정
    const { loadCliConfig } = await import('../config/cli-config.loader');
    (loadCliConfig as ReturnType<typeof vi.fn>).mockResolvedValue({});

    module = await Test.createTestingModule({
      providers: [
        TranslateCommand,
        { provide: PDF_EXTRACTOR, useValue: mockPdfExtractor },
        { provide: PDF_OVERLAY_GENERATOR, useValue: mockPdfOverlayGenerator },
        { provide: PDF_REBUILD_GENERATOR, useValue: mockPdfRebuildGenerator },
        {
          provide: TranslationServiceFactory,
          useValue: mockTranslationServiceFactory,
        },
      ],
    }).compile();

    command = module.get(TranslateCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  // ── 성공 케이스 (overlay 모드) ─────────────────────────────────────────────
  it('overlay mode: extractBlocksByPages → translateBatch → overlay 호출 → console.log 확인', async () => {
    const logSpy = vi.spyOn(console, 'log');

    await command.run([], {
      input: '/some/file.pdf',
      targetLang: 'ko',
      sourceLang: 'en',
      provider: TranslationProvider.MYMEMORY,
      mode: OutputMode.OVERLAY,
    } as never);

    expect(mockPdfExtractor.extractBlocksByPages).toHaveBeenCalledWith(
      expect.any(Buffer),
      undefined,
    );
    expect(mockTranslationServiceFactory.getService).toHaveBeenCalledWith(
      TranslationProvider.MYMEMORY,
    );
    expect(mockTranslationService.translateBatch).toHaveBeenCalledWith(
      ['Hello'],
      'en',
      'ko',
      undefined,
    );
    expect(mockPdfOverlayGenerator.overlay).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('file_ko.pdf'));
  });

  // ── rebuild 모드 ──────────────────────────────────────────────────────────
  it('rebuild mode: pdfRebuildGenerator.rebuild 호출 확인', async () => {
    await command.run([], {
      input: '/some/file.pdf',
      targetLang: 'ko',
      provider: TranslationProvider.MYMEMORY,
      mode: OutputMode.REBUILD,
    } as never);

    expect(mockPdfRebuildGenerator.rebuild).toHaveBeenCalled();
    expect(mockPdfOverlayGenerator.overlay).not.toHaveBeenCalled();
  });

  // ── 파일 읽기 실패 ────────────────────────────────────────────────────────
  it('파일 읽기 실패 시 process.exit(1) 호출 확인', async () => {
    (fsPromises.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('ENOENT: no such file'),
    );

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      await expect(
        command.run([], {
          input: '/nonexistent.pdf',
          targetLang: 'ko',
          provider: TranslationProvider.MYMEMORY,
          mode: OutputMode.OVERLAY,
        } as never),
      ).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  // ── extractBlocksByPages 실패 ─────────────────────────────────────────────
  it('extractBlocksByPages 실패 시 process.exit(1) 호출 확인', async () => {
    mockPdfExtractor.extractBlocksByPages.mockRejectedValue(
      new Error('PDF parse error'),
    );

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      await expect(
        command.run([], {
          input: '/corrupt.pdf',
          targetLang: 'ko',
          provider: TranslationProvider.MYMEMORY,
          mode: OutputMode.OVERLAY,
        } as never),
      ).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  // ── 번역 결과 1:1 매핑 ────────────────────────────────────────────────────
  it('translatedText가 blocks에 1:1로 매핑되어야 한다', async () => {
    mockTranslationService.translateBatch.mockResolvedValue(['안녕하세요']);

    await command.run([], {
      input: '/some/file.pdf',
      targetLang: 'ko',
      provider: TranslationProvider.MYMEMORY,
      mode: OutputMode.OVERLAY,
    } as never);

    const overlayCall = mockPdfOverlayGenerator.overlay.mock.calls[0] as unknown[];
    const blocks = overlayCall[1] as Array<{ translatedText?: string }>;
    expect(blocks[0].translatedText).toBe('안녕하세요');
  });

  // ── 출력 경로 기본값 ─────────────────────────────────────────────────────
  it('출력 경로 미지정 시 <input>_<targetLang>.pdf 기본값 사용', async () => {
    await command.run([], {
      input: 'input.pdf',
      targetLang: 'ko',
      provider: TranslationProvider.MYMEMORY,
      mode: OutputMode.OVERLAY,
    } as never);

    const overlayCall = mockPdfOverlayGenerator.overlay.mock.calls[0] as unknown[];
    expect(overlayCall[2]).toBe('input_ko.pdf');
  });

  it('출력 경로 지정 시 해당 경로 사용', async () => {
    await command.run([], {
      input: 'input.pdf',
      targetLang: 'ko',
      output: 'custom_output.pdf',
      provider: TranslationProvider.MYMEMORY,
      mode: OutputMode.OVERLAY,
    } as never);

    const overlayCall = mockPdfOverlayGenerator.overlay.mock.calls[0] as unknown[];
    expect(overlayCall[2]).toBe('custom_output.pdf');
  });

  // ── C-3: 페이지 범위 ────────────────────────────────────────────────────────
  it('--pages 옵션이 extractBlocksByPages에 전달되어야 한다', async () => {
    await command.run([], {
      input: '/some/file.pdf',
      targetLang: 'ko',
      provider: TranslationProvider.MYMEMORY,
      mode: OutputMode.OVERLAY,
      pages: '1-3,5',
    } as never);

    expect(mockPdfExtractor.extractBlocksByPages).toHaveBeenCalledWith(
      expect.any(Buffer),
      '1-3,5',
    );
  });

  // ── C-4: 설정 파일 연동 ─────────────────────────────────────────────────────
  it('설정 파일의 provider가 CLI 옵션이 없을 때 사용되어야 한다', async () => {
    const { loadCliConfig } = await import('../config/cli-config.loader');
    (loadCliConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      provider: 'gemini',
    });

    await command.run([], {
      input: '/some/file.pdf',
      targetLang: 'ko',
      mode: OutputMode.OVERLAY,
    } as never);

    expect(mockTranslationServiceFactory.getService).toHaveBeenCalledWith('gemini');
  });

  it('CLI 옵션이 설정 파일보다 우선순위가 높아야 한다', async () => {
    const { loadCliConfig } = await import('../config/cli-config.loader');
    (loadCliConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      provider: 'gemini',
    });

    await command.run([], {
      input: '/some/file.pdf',
      targetLang: 'ko',
      provider: TranslationProvider.MYMEMORY,
      mode: OutputMode.OVERLAY,
    } as never);

    expect(mockTranslationServiceFactory.getService).toHaveBeenCalledWith(
      TranslationProvider.MYMEMORY,
    );
  });

  it('설정 파일의 glossaryPath가 translateBatch에 전달되어야 한다', async () => {
    const { loadCliConfig } = await import('../config/cli-config.loader');
    (loadCliConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      glossaryPath: '/path/to/glossary.yml',
    });

    await command.run([], {
      input: '/some/file.pdf',
      targetLang: 'ko',
      provider: TranslationProvider.MYMEMORY,
      mode: OutputMode.OVERLAY,
    } as never);

    expect(mockTranslationService.translateBatch).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(String),
      'ko',
      { glossaryPath: '/path/to/glossary.yml' },
    );
  });

  // ── C-5: 용어집 연동 ────────────────────────────────────────────────────────
  it('--glossary 옵션이 translateBatch에 전달되어야 한다', async () => {
    await command.run([], {
      input: '/some/file.pdf',
      targetLang: 'ko',
      provider: TranslationProvider.MYMEMORY,
      mode: OutputMode.OVERLAY,
      glossary: '/glossary.yml',
    } as never);

    expect(mockTranslationService.translateBatch).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(String),
      'ko',
      { glossaryPath: '/glossary.yml' },
    );
  });

  it('--glossary 미지정 시 translateBatch에 undefined 전달', async () => {
    await command.run([], {
      input: '/some/file.pdf',
      targetLang: 'ko',
      provider: TranslationProvider.MYMEMORY,
      mode: OutputMode.OVERLAY,
    } as never);

    expect(mockTranslationService.translateBatch).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(String),
      'ko',
      undefined,
    );
  });

  // ── C-5: 재시도 ──────────────────────────────────────────────────────────────
  it('번역 실패 시 재시도 후 성공하면 정상 완료', async () => {
    mockTranslationService.translateBatch
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValue(['안녕하세요']);

    const logSpy = vi.spyOn(console, 'log');

    await command.run([], {
      input: '/some/file.pdf',
      targetLang: 'ko',
      provider: TranslationProvider.MYMEMORY,
      mode: OutputMode.OVERLAY,
    } as never);

    expect(mockTranslationService.translateBatch).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('attempt 1/3 failed'),
    );
    expect(mockPdfOverlayGenerator.overlay).toHaveBeenCalled();
  });

  it('번역 3회 모두 실패 시 process.exit(1) 호출', async () => {
    mockTranslationService.translateBatch.mockRejectedValue(
      new Error('API Error'),
    );

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      await expect(
        command.run([], {
          input: '/some/file.pdf',
          targetLang: 'ko',
          provider: TranslationProvider.MYMEMORY,
          mode: OutputMode.OVERLAY,
        } as never),
      ).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  // ── 옵션 파서 ──────────────────────────────────────────────────────────────
  describe('option parsers', () => {
    it('parseInput: 파일이 존재하면 값 그대로 반환', () => {
      expect(command.parseInput('test.pdf')).toBe('test.pdf');
    });

    it('parseInput: 파일이 없으면 process.exit(1)', () => {
      vi.mocked(fsSync.accessSync).mockImplementationOnce(() => { throw new Error('ENOENT'); });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      try {
        expect(() => command.parseInput('/nonexistent.pdf')).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        exitSpy.mockRestore();
      }
    });

    it('parseTargetLang: 유효한 언어코드 반환', () => {
      expect(command.parseTargetLang('ko')).toBe('ko');
      expect(command.parseTargetLang('zh-TW')).toBe('zh-TW');
      expect(command.parseTargetLang('pt-BR')).toBe('pt-BR');
    });

    it('parseTargetLang: 유효하지 않은 언어코드 → process.exit(1)', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      try {
        expect(() => command.parseTargetLang('INVALID')).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        exitSpy.mockRestore();
      }
    });

    it('parseSourceLang: 유효한 언어코드 반환', () => {
      expect(command.parseSourceLang('en')).toBe('en');
    });

    it('parseSourceLang: auto 허용', () => {
      expect(command.parseSourceLang('auto')).toBe('auto');
    });

    it('parseSourceLang: 유효하지 않은 언어코드 → process.exit(1)', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      try {
        expect(() => command.parseSourceLang('INVALID')).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        exitSpy.mockRestore();
      }
    });

    it('parseOutput: 값 그대로 반환', () => {
      expect(command.parseOutput('out.pdf')).toBe('out.pdf');
    });

    it('parseProvider: 유효한 값 반환', () => {
      expect(command.parseProvider('mymemory')).toBe('mymemory');
      expect(command.parseProvider('gemini')).toBe('gemini');
    });

    it('parseProvider: 유효하지 않은 값이면 process.exit(1)', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      try {
        expect(() => command.parseProvider('invalid-provider')).toThrow(
          'process.exit called',
        );
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        exitSpy.mockRestore();
      }
    });

    it('parseMode: 유효한 값 반환', () => {
      expect(command.parseMode('overlay')).toBe('overlay');
      expect(command.parseMode('rebuild')).toBe('rebuild');
    });

    it('parseMode: 유효하지 않은 값이면 process.exit(1)', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      try {
        expect(() => command.parseMode('invalid-mode')).toThrow(
          'process.exit called',
        );
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        exitSpy.mockRestore();
      }
    });

    it('parseFont: 파일이 존재하면 값 그대로 반환', () => {
      expect(command.parseFont('/path/to/font.ttf')).toBe('/path/to/font.ttf');
    });

    it('parseFont: 파일이 없으면 process.exit(1)', () => {
      vi.mocked(fsSync.accessSync).mockImplementationOnce(() => { throw new Error('ENOENT'); });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      try {
        expect(() => command.parseFont('/nonexistent/font.ttf')).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        exitSpy.mockRestore();
      }
    });

    it('parsePages: 값 그대로 반환', () => {
      expect(command.parsePages('1-5,10')).toBe('1-5,10');
    });

    it('parseGlossary: 파일이 존재하면 값 그대로 반환', () => {
      expect(command.parseGlossary('/glossary.yml')).toBe('/glossary.yml');
    });

    it('parseGlossary: 파일이 없으면 process.exit(1)', () => {
      vi.mocked(fsSync.accessSync).mockImplementationOnce(() => { throw new Error('ENOENT'); });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      try {
        expect(() => command.parseGlossary('/nonexistent/glossary.yml')).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        exitSpy.mockRestore();
      }
    });

    it('parseBilingual: true 반환', () => {
      expect(command.parseBilingual('')).toBe(true);
    });
  });
});
