import { execSync } from 'child_process';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TranslateCommand } from '../src/cli/commands/translate.command';
import { CliModule } from '../src/cli/cli.module';
import {
  PDF_EXTRACTOR,
  PDF_OVERLAY_GENERATOR,
  TextBlock,
} from '../src/pdf/interfaces';
import { TranslationServiceFactory } from '../src/translation/factories/translation-service.factory';

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 fake')),
}));

const sampleBlock: TextBlock = {
  text: 'Hello World',
  page: 1,
  x: 50,
  y: 700,
  width: 200,
  height: 20,
  fontSize: 12,
  fontName: 'Helvetica',
};

describe('CLI --help', () => {
  it('--help 출력이 정상 동작해야 한다', () => {
    const output = execSync(
      'node_modules/.bin/ts-node -r tsconfig-paths/register src/cli.ts translate --help',
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
        env: { ...process.env, GEMINI_API_KEY: 'test-dummy-key' },
      },
    );
    expect(output).toContain('translate');
  });
});

describe('CLI E2E — TranslateCommand', () => {
  let module: TestingModule;
  let command: TranslateCommand;

  const mockExtractor = {
    extractBlocks: vi.fn(),
    extractBlocksByPages: vi.fn(),
  };

  const mockOverlayGenerator = {
    overlay: vi.fn().mockResolvedValue(undefined),
  };

  const mockTranslationService = {
    translate: vi.fn(),
    translateBatch: vi.fn().mockResolvedValue(['안녕 세계']),
    getSupportedLanguages: vi.fn(),
  };

  const mockFactory = {
    getService: vi.fn().mockReturnValue(mockTranslationService),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExtractor.extractBlocksByPages.mockResolvedValue([[{ ...sampleBlock }]]);
    mockTranslationService.translateBatch.mockResolvedValue(['안녕 세계']);

    module = await Test.createTestingModule({
      imports: [CliModule],
    })
      .overrideProvider(PDF_EXTRACTOR)
      .useValue(mockExtractor)
      .overrideProvider(PDF_OVERLAY_GENERATOR)
      .useValue(mockOverlayGenerator)
      .overrideProvider(TranslationServiceFactory)
      .useValue(mockFactory)
      .compile();

    command = module.get(TranslateCommand);
  });

  it('should resolve TranslateCommand from CliModule', () => {
    expect(command).toBeDefined();
  });

  it('should run full overlay translation flow', async () => {
    await command.run([], {
      input: '/tmp/test.pdf',
      targetLang: 'ko',
      sourceLang: 'en',
      provider: 'mymemory',
      mode: 'overlay',
      output: '/tmp/test_ko.pdf',
    } as never);

    expect(mockExtractor.extractBlocksByPages).toHaveBeenCalledOnce();
    expect(mockTranslationService.translateBatch).toHaveBeenCalledWith(
      ['Hello World'],
      'en',
      'ko',
    );
    expect(mockOverlayGenerator.overlay).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.arrayContaining([
        expect.objectContaining({ translatedText: '안녕 세계' }),
      ]),
      '/tmp/test_ko.pdf',
      { fontPath: undefined },
    );
  });

  it('should default output path to <input>_<targetLang>.pdf', async () => {
    await command.run([], {
      input: '/tmp/document.pdf',
      targetLang: 'ja',
      mode: 'overlay',
    } as never);

    expect(mockOverlayGenerator.overlay).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(Array),
      '/tmp/document_ja.pdf',
      { fontPath: undefined },
    );
  });

  it('should pass fontPath to overlay generator when --font is provided', async () => {
    await command.run([], {
      input: '/tmp/test.pdf',
      targetLang: 'ko',
      mode: 'overlay',
      font: '/assets/fonts/NotoSans.ttf',
    } as never);

    expect(mockOverlayGenerator.overlay).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(Array),
      '/tmp/test_ko.pdf',
      { fontPath: '/assets/fonts/NotoSans.ttf' },
    );
  });

  it('should exit with code 1 when rebuild mode is requested', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit(1)');
    });

    await expect(
      command.run([], {
        input: '/tmp/test.pdf',
        targetLang: 'ko',
        mode: 'rebuild',
      } as never),
    ).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('should exit with code 1 when input file cannot be read', async () => {
    const { readFile } = await import('fs/promises');
    const readFileMock = readFile as ReturnType<typeof vi.fn>;
    readFileMock.mockRejectedValueOnce(
      new Error('ENOENT: no such file or directory'),
    );

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit(1)');
    });

    await expect(
      command.run([], {
        input: '/nonexistent/file.pdf',
        targetLang: 'ko',
        mode: 'overlay',
      } as never),
    ).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
