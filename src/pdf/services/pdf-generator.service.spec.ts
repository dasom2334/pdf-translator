import { Test } from '@nestjs/testing';
import { PdfGeneratorService } from './pdf-generator.service';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('PdfGeneratorService', () => {
  let service: PdfGeneratorService;
  let tmpDir: string;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PdfGeneratorService],
    }).compile();
    service = moduleRef.get(PdfGeneratorService);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate a PDF file', async () => {
    const outputPath = path.join(tmpDir, 'output.pdf');
    await service.generate('Hello World', outputPath);
    expect(fs.existsSync(outputPath)).toBe(true);
    const bytes = fs.readFileSync(outputPath);
    expect(bytes[0]).toBe(0x25); // %
    expect(bytes[1]).toBe(0x50); // P
    expect(bytes[2]).toBe(0x44); // D
    expect(bytes[3]).toBe(0x46); // F
  });

  it('should generate PDF from multiple pages', async () => {
    const outputPath = path.join(tmpDir, 'multipage.pdf');
    await service.generateFromPages(['Page 1 content', 'Page 2 content'], outputPath);
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  it('should create output directory if it does not exist', async () => {
    const outputPath = path.join(tmpDir, 'nested', 'dir', 'output.pdf');
    await service.generate('test', outputPath);
    expect(fs.existsSync(outputPath)).toBe(true);
  });
});
