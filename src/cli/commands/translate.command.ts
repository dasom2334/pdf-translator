import * as fs from 'fs/promises';
import * as path from 'path';
import { Inject } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import {
  IPdfExtractor,
  IPdfOverlayGenerator,
  PDF_EXTRACTOR,
  PDF_OVERLAY_GENERATOR,
} from '../../pdf/interfaces';
import { TranslationServiceFactory } from '../../translation/factories/translation-service.factory';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';
import { OutputMode } from '../../common/enums/output-mode.enum';

interface TranslateCommandOptions {
  input: string;
  targetLang: string;
  sourceLang?: string;
  output?: string;
  provider?: string;
  mode?: string;
  font?: string;
}

@Command({
  name: 'translate',
  description: 'Translate a PDF file',
})
export class TranslateCommand extends CommandRunner {
  constructor(
    @Inject(PDF_EXTRACTOR)
    private readonly pdfExtractor: IPdfExtractor,
    @Inject(PDF_OVERLAY_GENERATOR)
    private readonly pdfOverlayGenerator: IPdfOverlayGenerator,
    private readonly translationServiceFactory: TranslationServiceFactory,
  ) {
    super();
  }

  @Option({
    flags: '-i, --input <path>',
    description: 'Input PDF file path',
    required: true,
  })
  parseInput(val: string): string {
    return val;
  }

  @Option({
    flags: '-t, --target-lang <lang>',
    description: 'Target language code',
    required: true,
  })
  parseTargetLang(val: string): string {
    return val;
  }

  @Option({
    flags: '-s, --source-lang <lang>',
    description: 'Source language code',
  })
  parseSourceLang(val: string): string {
    return val;
  }

  @Option({
    flags: '-o, --output <path>',
    description: 'Output PDF file path',
  })
  parseOutput(val: string): string {
    return val;
  }

  @Option({
    flags: '-p, --provider <provider>',
    description: 'Translation provider (mymemory|gemini)',
    defaultValue: 'mymemory',
  })
  parseProvider(val: string): string {
    return val;
  }

  @Option({
    flags: '--mode <mode>',
    description: 'Output mode (overlay|rebuild)',
    defaultValue: 'overlay',
  })
  parseMode(val: string): string {
    return val;
  }

  @Option({
    flags: '--font <path>',
    description: 'Path to custom TTF/OTF font file',
  })
  parseFont(val: string): string {
    return val;
  }

  async run(
    _passedParams: string[],
    options?: TranslateCommandOptions,
  ): Promise<void> {
    const opts = options ?? ({} as TranslateCommandOptions);

    if (!opts.input) {
      console.error('Error: --input (-i) is required');
      process.exit(1);
    }

    if (!opts.targetLang) {
      console.error('Error: --target-lang (-t) is required');
      process.exit(1);
    }

    const inputPath = opts.input;
    const targetLang = opts.targetLang;
    const sourceLang = opts.sourceLang ?? 'auto';
    const provider = (opts.provider ?? 'mymemory') as TranslationProvider;
    const mode = (opts.mode ?? 'overlay') as OutputMode;
    const fontPath = opts.font;

    const outputPath =
      opts.output ??
      (() => {
        const ext = path.extname(inputPath);
        const base = inputPath.slice(0, inputPath.length - ext.length);
        return `${base}_${targetLang}${ext}`;
      })();

    try {
      // Step 1: Read PDF buffer
      let buffer: Buffer;
      try {
        buffer = await fs.readFile(inputPath);
      } catch {
        console.error(`Error: Cannot read input file "${inputPath}"`);
        process.exit(1);
      }

      // Step 2: Extract text blocks by page
      console.log('Extracting text from PDF...');
      const pageBlocks = await this.pdfExtractor.extractBlocksByPages(buffer);

      // Step 3: Flatten blocks and collect texts
      const flatBlocks = pageBlocks.flat();
      const texts = flatBlocks.map((b) => b.text);

      if (texts.length === 0) {
        console.error('Error: No text blocks found in PDF');
        process.exit(1);
      }

      // Step 4: Translate
      console.log(`Translating ${texts.length} text blocks using ${provider}...`);
      const translationService = this.translationServiceFactory.getService(provider);
      const translated = await translationService.translateBatch(
        texts,
        sourceLang,
        targetLang,
      );

      // Step 5: Map translations back to blocks
      for (let i = 0; i < flatBlocks.length; i++) {
        flatBlocks[i].translatedText = translated[i];
      }

      // Step 6: Generate output PDF
      if (mode === OutputMode.REBUILD) {
        console.error('Error: rebuild mode is not yet supported');
        process.exit(1);
      }

      // overlay mode
      console.log('Generating translated PDF...');
      await this.pdfOverlayGenerator.overlay(buffer, flatBlocks, outputPath, {
        fontPath,
      });

      console.log(`Translation complete. Output saved to: ${outputPath}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`Error: ${err.message}`);
      } else {
        console.error('An unexpected error occurred');
      }
      process.exit(1);
    }
  }
}
