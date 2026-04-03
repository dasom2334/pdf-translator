import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TranslateCommand } from './translate.command';
import {
  PDF_EXTRACTOR,
  PDF_OVERLAY_GENERATOR,
  TextBlock,
} from '../../pdf/interfaces';
import { TranslationServiceFactory } from '../../translation/factories/translation-service.factory';

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
    // Reset per-test mocks to default behavior
    mockPdfExtractor.extractBlocksByPages.mockResolvedValue([[{ ...mockBlock }]]);
    mockTranslationService.translateBatch.mockResolvedValue(['Hola']);

    module = await Test.createTestingModule({
      providers: [
        TranslateCommand,
        { provide: PDF_EXTRACTOR, useValue: mockPdfExtractor },
        { provide: PDF_OVERLAY_GENERATOR, useValue: mockPdfOverlayGenerator },
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

  it('should parse input option', () => {
    expect(command.parseInput('/path/to/file.pdf')).toBe('/path/to/file.pdf');
  });

  it('should parse targetLang option', () => {
    expect(command.parseTargetLang('ko')).toBe('ko');
  });

  it('should parse sourceLang option', () => {
    expect(command.parseSourceLang('en')).toBe('en');
  });

  it('should parse output option', () => {
    expect(command.parseOutput('/out/file.pdf')).toBe('/out/file.pdf');
  });

  it('should parse provider option', () => {
    expect(command.parseProvider('gemini')).toBe('gemini');
  });

  it('should parse mode option', () => {
    expect(command.parseMode('overlay')).toBe('overlay');
  });

  it('should parse font option', () => {
    expect(command.parseFont('/fonts/NotoSans.ttf')).toBe('/fonts/NotoSans.ttf');
  });

  it('should exit with code 1 when input is not provided', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    await expect(
      command.run([], { input: '', targetLang: 'ko' } as never),
    ).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('should exit with code 1 when targetLang is not provided', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    await expect(
      command.run([], { input: '/some/file.pdf', targetLang: '' } as never),
    ).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('should exit with code 1 for rebuild mode', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    await expect(
      command.run([], {
        input: '/some/file.pdf',
        targetLang: 'ko',
        mode: 'rebuild',
      } as never),
    ).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('should orchestrate overlay translation successfully', async () => {
    await command.run([], {
      input: '/some/file.pdf',
      targetLang: 'ko',
      sourceLang: 'en',
      provider: 'mymemory',
      mode: 'overlay',
    } as never);

    expect(mockPdfExtractor.extractBlocksByPages).toHaveBeenCalled();
    expect(mockTranslationService.translateBatch).toHaveBeenCalledWith(
      ['Hello'],
      'en',
      'ko',
    );
    expect(mockPdfOverlayGenerator.overlay).toHaveBeenCalled();
  });
});
