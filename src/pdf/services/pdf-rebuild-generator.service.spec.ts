import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
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

    // Verify the output is a valid PDF (starts with %PDF)
    const written = fs.readFileSync(outputPath);
    expect(written[0]).toBe(0x25); // %
    expect(written[1]).toBe(0x50); // P
    expect(written[2]).toBe(0x44); // D
    expect(written[3]).toBe(0x46); // F
  });

  it('should produce a PDF parseable by pdf-lib', async () => {
    const outputPath = path.join(tmpDir, 'output-parse.pdf');
    const blocks: TextBlock[] = [makeBlock()];

    await service.rebuild(blocks, outputPath);

    const written = fs.readFileSync(outputPath);
    const doc = await PDFDocument.load(written);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Empty blocks — still creates a valid single-page PDF
  // -------------------------------------------------------------------------

  it('should create a valid single-page PDF when blocks is empty', async () => {
    const outputPath = path.join(tmpDir, 'output-empty.pdf');

    await service.rebuild([], outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);
    const written = fs.readFileSync(outputPath);
    const doc = await PDFDocument.load(written);
    expect(doc.getPageCount()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Multi-page: blocks from different pages produce multiple pages
  // -------------------------------------------------------------------------

  it('should create multiple pages for blocks on different pages', async () => {
    const outputPath = path.join(tmpDir, 'output-multipage.pdf');
    const blocks: TextBlock[] = [
      makeBlock({ page: 1, x: 50, y: 100 }),
      makeBlock({ page: 2, x: 50, y: 100, translatedText: '두 번째 페이지' }),
      makeBlock({ page: 3, x: 50, y: 100, translatedText: '세 번째 페이지' }),
    ];

    await service.rebuild(blocks, outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);
    const written = fs.readFileSync(outputPath);
    const doc = await PDFDocument.load(written);
    expect(doc.getPageCount()).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Blocks without translatedText fall back to original text
  // -------------------------------------------------------------------------

  it('should use block.text when translatedText is not set', async () => {
    const outputPath = path.join(tmpDir, 'output-fallback.pdf');
    const blocks: TextBlock[] = [makeBlock({ translatedText: undefined })];

    await expect(service.rebuild(blocks, outputPath)).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Custom font path option
  // -------------------------------------------------------------------------

  it('should fall back to standard font when fontPath does not exist', async () => {
    const outputPath = path.join(tmpDir, 'output-custom-font.pdf');
    const blocks: TextBlock[] = [makeBlock()];

    await expect(
      service.rebuild(blocks, outputPath, { fontPath: '/nonexistent/font.ttf' }),
    ).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Overflow handling — long translated text should not throw
  // -------------------------------------------------------------------------

  it('should handle text overflow without throwing', async () => {
    const outputPath = path.join(tmpDir, 'output-overflow.pdf');
    const longText = 'A'.repeat(500);
    const blocks: TextBlock[] = [makeBlock({ width: 10, translatedText: longText })];

    await expect(service.rebuild(blocks, outputPath)).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Output directory is created if it doesn't exist
  // -------------------------------------------------------------------------

  it('should create output directory if it does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'deep');
    const outputPath = path.join(nestedDir, 'output.pdf');
    const blocks: TextBlock[] = [makeBlock()];

    await expect(service.rebuild(blocks, outputPath)).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Error: write failure simulated via read-only path
  // -------------------------------------------------------------------------

  it('should throw InternalServerErrorException when output path is not writable', async () => {
    // Use a path that cannot be written (root directory on mac/linux)
    const outputPath = '/output-no-permission.pdf';
    const blocks: TextBlock[] = [makeBlock()];

    await expect(service.rebuild(blocks, outputPath)).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
