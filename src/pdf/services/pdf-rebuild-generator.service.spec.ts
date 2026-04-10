import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PdfRebuildGeneratorService } from './pdf-rebuild-generator.service';
import { TextBlock } from '../interfaces';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlock(overrides: Partial<TextBlock> = {}): TextBlock {
  return {
    text: 'Hello',
    translatedText: '안녕하세요',
    page: 1,
    x: 50,
    y: 100,
    width: 200,
    height: 20,
    fontSize: 12,
    fontName: 'Helvetica',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PdfRebuildGeneratorService', () => {
  let service: PdfRebuildGeneratorService;
  let tmpDir: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfRebuildGeneratorService],
    }).compile();

    service = module.get<PdfRebuildGeneratorService>(PdfRebuildGeneratorService);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-rebuild-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // -------------------------------------------------------------------------
  // Basic instantiation
  // -------------------------------------------------------------------------

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Happy path: rebuild produces a valid PDF file
  // -------------------------------------------------------------------------

  it('should write a valid PDF file to outputPath', async () => {
    const outputPath = path.join(tmpDir, 'output.pdf');
    const blocks: TextBlock[] = [makeBlock()];

    await service.rebuild(blocks, outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);

    // Verify the output starts with %PDF magic bytes
    const written = fs.readFileSync(outputPath);
    expect(written[0]).toBe(0x25); // %
    expect(written[1]).toBe(0x50); // P
    expect(written[2]).toBe(0x44); // D
    expect(written[3]).toBe(0x46); // F
  });

  // -------------------------------------------------------------------------
  // Multiple pages
  // -------------------------------------------------------------------------

  it('should create a PDF with multiple pages when blocks span multiple pages', async () => {
    const outputPath = path.join(tmpDir, 'output-multipage.pdf');
    const blocks: TextBlock[] = [
      makeBlock({ page: 1, translatedText: 'Page 1 text' }),
      makeBlock({ page: 2, x: 100, y: 200, translatedText: 'Page 2 text' }),
      makeBlock({ page: 3, x: 50, y: 50, translatedText: 'Page 3 text' }),
    ];

    await service.rebuild(blocks, outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);
    const written = fs.readFileSync(outputPath);
    expect(written[0]).toBe(0x25); // %PDF
  });

  // -------------------------------------------------------------------------
  // Blocks without translatedText fall back to original text
  // -------------------------------------------------------------------------

  it('should use block.text when translatedText is undefined', async () => {
    const outputPath = path.join(tmpDir, 'output-notranslated.pdf');
    const blocks: TextBlock[] = [makeBlock({ translatedText: undefined })];

    await expect(service.rebuild(blocks, outputPath)).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Empty blocks → InternalServerErrorException
  // -------------------------------------------------------------------------

  it('should throw InternalServerErrorException for empty blocks array', async () => {
    const outputPath = path.join(tmpDir, 'output-empty.pdf');

    await expect(service.rebuild([], outputPath)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  // -------------------------------------------------------------------------
  // Overflow handling
  // -------------------------------------------------------------------------

  it('should handle overflow text without throwing', async () => {
    const outputPath = path.join(tmpDir, 'output-overflow.pdf');
    const longText = 'A'.repeat(500);
    const blocks: TextBlock[] = [
      makeBlock({ width: 30, fontSize: 12, translatedText: longText }),
    ];

    await expect(service.rebuild(blocks, outputPath)).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  }, 15000);

  // -------------------------------------------------------------------------
  // Custom font path option
  // -------------------------------------------------------------------------

  it('should use fallback font when options.fontPath does not exist', async () => {
    const outputPath = path.join(tmpDir, 'output-custom-font.pdf');
    const blocks: TextBlock[] = [makeBlock()];

    await expect(
      service.rebuild(blocks, outputPath, { fontPath: '/nonexistent/font.ttf' }),
    ).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Output directory creation
  // -------------------------------------------------------------------------

  it('should create output directory if it does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'deep');
    const outputPath = path.join(nestedDir, 'output.pdf');
    const blocks: TextBlock[] = [makeBlock()];

    await expect(service.rebuild(blocks, outputPath)).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Zero-dimension blocks should not throw
  // -------------------------------------------------------------------------

  it('should handle blocks with zero width gracefully', async () => {
    const outputPath = path.join(tmpDir, 'output-zero-width.pdf');
    const blocks: TextBlock[] = [makeBlock({ width: 0, height: 0, fontSize: 0 })];

    await expect(service.rebuild(blocks, outputPath)).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  });
});
