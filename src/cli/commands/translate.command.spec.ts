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

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('pdf-data')),
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

  // ── 옵션 파서 ──────────────────────────────────────────────────────────────
  describe('option parsers', () => {
    it('parseInput: 값 그대로 반환', () => {
      expect(command.parseInput('test.pdf')).toBe('test.pdf');
    });

    it('parseTargetLang: 값 그대로 반환', () => {
      expect(command.parseTargetLang('ko')).toBe('ko');
    });

    it('parseSourceLang: 값 그대로 반환', () => {
      expect(command.parseSourceLang('en')).toBe('en');
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

    it('parseFont: 값 그대로 반환', () => {
      expect(command.parseFont('/path/to/font.ttf')).toBe('/path/to/font.ttf');
    });
  });
});
