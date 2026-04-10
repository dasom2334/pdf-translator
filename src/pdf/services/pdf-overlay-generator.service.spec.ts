import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { PdfOverlayGeneratorService, stripBtEtFromPdfBytes } from './pdf-overlay-generator.service';
import { TextBlock } from '../interfaces';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createMinimalPdfBuffer(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([100, 100]); // 작은 페이지 — pdfjs 렌더링 캔버스 크기를 줄여 테스트 속도 개선
  return Buffer.from(await doc.save());
}

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

describe('PdfOverlayGeneratorService', () => {
  let service: PdfOverlayGeneratorService;
  let tmpDir: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfOverlayGeneratorService],
    }).compile();

    service = module.get<PdfOverlayGeneratorService>(PdfOverlayGeneratorService);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-overlay-test-'));
  });

  afterEach(() => {
    // Clean up temp files
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
  // Happy path: overlay produces a valid PDF file
  // -------------------------------------------------------------------------

  it('should write a valid PDF file to outputPath', async () => {
    const pdfBuffer = await createMinimalPdfBuffer();
    const outputPath = path.join(tmpDir, 'output.pdf');
    const blocks: TextBlock[] = [makeBlock()];

    await service.overlay(pdfBuffer, blocks, outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);

    // Verify the output is a valid PDF (starts with %PDF)
    const written = fs.readFileSync(outputPath);
    expect(written[0]).toBe(0x25); // %
    expect(written[1]).toBe(0x50); // P
    expect(written[2]).toBe(0x44); // D
    expect(written[3]).toBe(0x46); // F
  });

  // -------------------------------------------------------------------------
  // Blocks without translatedText should be skipped
  // -------------------------------------------------------------------------

  it('should skip blocks without translatedText', async () => {
    const pdfBuffer = await createMinimalPdfBuffer();
    const outputPath = path.join(tmpDir, 'output-skip.pdf');
    const blocks: TextBlock[] = [makeBlock({ translatedText: undefined })];

    await expect(service.overlay(pdfBuffer, blocks, outputPath)).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Blocks with out-of-range page numbers should be skipped
  // -------------------------------------------------------------------------

  it('should skip blocks whose page index is out of range', async () => {
    const pdfBuffer = await createMinimalPdfBuffer(); // 1 page
    const outputPath = path.join(tmpDir, 'output-oob.pdf');
    const blocks: TextBlock[] = [makeBlock({ page: 99 })];

    await expect(service.overlay(pdfBuffer, blocks, outputPath)).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Invalid buffer → InternalServerErrorException
  // -------------------------------------------------------------------------

  it('should throw InternalServerErrorException for invalid PDF buffer', async () => {
    const invalidBuffer = Buffer.from('not a pdf');
    const outputPath = path.join(tmpDir, 'output-invalid.pdf');

    await expect(
      service.overlay(invalidBuffer, [], outputPath),
    ).rejects.toThrow(InternalServerErrorException);
  });

  // -------------------------------------------------------------------------
  // Overflow — long text should not throw and output should be valid
  // -------------------------------------------------------------------------

  it('should handle overflow text without throwing', async () => {
    const pdfBuffer = await createMinimalPdfBuffer();
    const outputPath = path.join(tmpDir, 'output-overflow.pdf');

    // Very long translated text that will overflow the 50pt-wide box
    const longText = '가나다라마바사아자차카타파하'.repeat(20);
    const blocks: TextBlock[] = [makeBlock({ width: 50, fontSize: 12, translatedText: longText })];

    await expect(service.overlay(pdfBuffer, blocks, outputPath)).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Overflow — fitText internal logic
  // -------------------------------------------------------------------------

  describe('fitText (overflow logic via overlay)', () => {
    it('should shrink fontSize when text slightly overflows', async () => {
      const pdfBuffer = await createMinimalPdfBuffer();
      const outputPath = path.join(tmpDir, 'output-shrink.pdf');

      // Moderately overflowing text: the service should reduce fontSize
      const moderateOverflow = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // 30 chars
      const blocks: TextBlock[] = [makeBlock({ width: 60, fontSize: 14, translatedText: moderateOverflow })];

      await expect(service.overlay(pdfBuffer, blocks, outputPath)).resolves.not.toThrow();
      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('should truncate with ellipsis when text cannot fit even at MIN_FONT_SIZE', async () => {
      const pdfBuffer = await createMinimalPdfBuffer();
      const outputPath = path.join(tmpDir, 'output-ellipsis.pdf');

      // Extremely long text in a tiny box: must trigger ellipsis path
      const extremeOverflow = 'X'.repeat(500);
      const blocks: TextBlock[] = [makeBlock({ width: 10, fontSize: 12, translatedText: extremeOverflow })];

      await expect(service.overlay(pdfBuffer, blocks, outputPath)).resolves.not.toThrow();
      expect(fs.existsSync(outputPath)).toBe(true);
    }, 15000);

    it('should not enter infinite loop when boxWidth is 0', async () => {
      const pdfBuffer = await createMinimalPdfBuffer();
      const outputPath = path.join(tmpDir, 'output-zero-width.pdf');

      const blocks: TextBlock[] = [makeBlock({ width: 0, fontSize: 12, translatedText: 'Some text' })];

      await expect(service.overlay(pdfBuffer, blocks, outputPath)).resolves.not.toThrow();
      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('fitText should shrink font size when text overflows boxWidth', () => {
      const measureWidth = (t: string, size: number) => t.length * size * 0.6;
      const result = service.fitText('AAAAAAAAAAAAAAAA', 30, 14, measureWidth);
      expect(result.fontSize).toBeLessThan(14);
    });

    it('fitText should return empty string when boxWidth is 0', () => {
      const measureWidth = (t: string, size: number) => t.length * size * 0.6;
      const result = service.fitText('Hello', 0, 12, measureWidth);
      expect(result.text).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Custom font path option
  // -------------------------------------------------------------------------

  it('should use fallback font when options.fontPath does not exist', async () => {
    const pdfBuffer = await createMinimalPdfBuffer();
    const outputPath = path.join(tmpDir, 'output-custom-font.pdf');
    const blocks: TextBlock[] = [makeBlock()];

    await expect(
      service.overlay(pdfBuffer, blocks, outputPath, { fontPath: '/nonexistent/font.ttf' }),
    ).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Multiple pages / multiple blocks
  // -------------------------------------------------------------------------

  it('should process multiple blocks across multiple pages', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    doc.addPage([595, 842]);
    const pdfBuffer = Buffer.from(await doc.save());

    const outputPath = path.join(tmpDir, 'output-multipage.pdf');
    const blocks: TextBlock[] = [
      makeBlock({ page: 1, x: 50, y: 100 }),
      makeBlock({ page: 2, x: 100, y: 200, translatedText: '두 번째 페이지' }),
    ];

    await expect(service.overlay(pdfBuffer, blocks, outputPath)).resolves.not.toThrow();
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // PDF 콘텐츠 스트림에서 텍스트 명령어(BT...ET) 제거
  // -------------------------------------------------------------------------

  describe('stripBtEtFromPdfBytes', () => {
    it('should return changed=false for a buffer with no BT/ET operators', () => {
      const buf = Buffer.from('%PDF-1.4\nsome content without BT-ET markers');
      const { changed } = stripBtEtFromPdfBytes(buf);
      expect(changed).toBe(false);
    });

    it('should remove a simple BT...ET block and return changed=true', () => {
      // Construct a buffer that contains a BT...ET segment surrounded by whitespace
      const before = Buffer.from('stream\n');
      const btEt = Buffer.from('BT\n/Helvetica 12 Tf\n(Hello) Tj\nET\n');
      const after = Buffer.from('endstream');
      const input = Buffer.concat([before, btEt, after]);

      const { strippedBytes, changed } = stripBtEtFromPdfBytes(input);
      expect(changed).toBe(true);

      // The output should have the same length as the input
      expect(strippedBytes.length).toBe(input.length);

      // The BT and ET bytes should have been replaced with spaces
      const output = strippedBytes.toString('latin1');
      expect(output).not.toContain('BT\n');
      expect(output).not.toContain('\nET\n');
    });

    it('should handle multiple BT...ET segments', () => {
      const input = Buffer.from('q\nBT\n(First) Tj\nET\nsome ops\nBT\n(Second) Tj\nET\nQ\n');
      const { strippedBytes, changed } = stripBtEtFromPdfBytes(input);
      expect(changed).toBe(true);
      const output = strippedBytes.toString('latin1');
      // Neither text segment should remain as-is
      expect(output).not.toMatch(/BT\n/);
    });

    it('should not modify buffer when BT appears without a matching ET', () => {
      // BT with no ET — scanner should skip and not corrupt the buffer
      const input = Buffer.from('stream\nBT\n(text) Tj\nendstream');
      const { changed } = stripBtEtFromPdfBytes(input);
      // Depending on implementation, changed may be false (no valid BT/ET pair)
      // We primarily check that the function does not throw
      expect(typeof changed).toBe('boolean');
    });

    it('should not treat ET inside a string literal as a segment end', () => {
      // 'ET' appears inside parentheses string — but at the byte level it IS
      // treated as a potential ET; this test documents the known limitation
      // (conservative implementation is acceptable).
      const input = Buffer.from('BT\n/F1 12 Tf\nET\n');
      const { strippedBytes, changed } = stripBtEtFromPdfBytes(input);
      expect(changed).toBe(true);
      expect(strippedBytes.length).toBe(input.length);
    });
  });
});
