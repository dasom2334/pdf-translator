import * as fs from 'fs/promises';
import * as path from 'path';
import { Inject } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import {
  IPdfExtractor,
  IPdfOverlayGenerator,
  IPdfRebuildGenerator,
  PDF_EXTRACTOR,
  PDF_OVERLAY_GENERATOR,
  PDF_REBUILD_GENERATOR,
} from '../../pdf/interfaces';
import { TranslationServiceFactory } from '../../translation/factories/translation-service.factory';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';
import { OutputMode } from '../../common/enums/output-mode.enum';
import { loadCliConfig } from '../config/cli-config.loader';
import { printProgress } from '../utils/progress';
import { parsePageRange } from '../utils/page-range.parser';

interface TranslateCommandOptions {
  input: string;
  targetLang: string;
  sourceLang?: string;
  output?: string;
  provider?: string;
  mode?: string;
  font?: string;
  pages?: string;
  glossary?: string;
  bilingual?: boolean;
}

const MAX_RETRY = 3;

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
    @Inject(PDF_REBUILD_GENERATOR)
    private readonly pdfRebuildGenerator: IPdfRebuildGenerator,
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
    const valid = Object.values(TranslationProvider) as string[];
    if (!valid.includes(val)) {
      console.error(
        `Error: Invalid provider "${val}". Valid values: ${valid.join(', ')}`,
      );
      process.exit(1);
    }
    return val;
  }

  @Option({
    flags: '--mode <mode>',
    description: 'Output mode (overlay|rebuild)',
    defaultValue: 'overlay',
  })
  parseMode(val: string): string {
    const valid = Object.values(OutputMode) as string[];
    if (!valid.includes(val)) {
      console.error(
        `Error: Invalid mode "${val}". Valid values: ${valid.join(', ')}`,
      );
      process.exit(1);
    }
    return val;
  }

  @Option({
    flags: '--font <path>',
    description: 'Path to custom TTF/OTF font file',
  })
  parseFont(val: string): string {
    return val;
  }

  @Option({
    flags: '--pages <range>',
    description: 'Page range to translate (e.g. 1-5,10)',
  })
  parsePages(val: string): string {
    try {
      parsePageRange(val);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: Invalid --pages value: ${msg}`);
      process.exit(1);
    }
    return val;
  }

  @Option({
    flags: '--glossary <file>',
    description: 'Path to glossary YAML/JSON file',
  })
  parseGlossary(val: string): string {
    return val;
  }

  @Option({
    flags: '--bilingual',
    description: 'Generate bilingual PDF with original and translated text',
  })
  parseBilingual(_val: string): boolean {
    return true;
  }

  async run(
    _passedParams: string[],
    options?: TranslateCommandOptions,
  ): Promise<void> {
    // C-4: 설정 파일 로드 (우선순위: CLI 옵션 > 설정 파일 > 기본값)
    const fileConfig = await loadCliConfig();

    const opts = options ?? ({} as TranslateCommandOptions);

    if (!opts.input) {
      console.error('Error: --input (-i) is required');
      process.exit(1);
    }

    if (!opts.targetLang && !fileConfig.targetLang) {
      console.error('Error: --target-lang (-t) is required');
      process.exit(1);
    }

    const inputPath = opts.input;
    const targetLang = opts.targetLang ?? fileConfig.targetLang ?? '';
    const sourceLang = opts.sourceLang ?? fileConfig.sourceLang ?? 'auto';
    const provider = (opts.provider ?? fileConfig.provider ?? 'mymemory') as TranslationProvider;
    const mode = (opts.mode ?? fileConfig.mode ?? 'overlay') as OutputMode;
    const fontPath = opts.font ?? fileConfig.fontPath;
    const glossaryPath = opts.glossary ?? fileConfig.glossaryPath;

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

      // Step 2: Extract text blocks by page (C-3: pages 옵션 전달)
      console.log('Extracting text from PDF...');
      const pageBlocks = await this.pdfExtractor.extractBlocksByPages(
        buffer,
        opts.pages,
      );

      const totalPages = pageBlocks.length;
      console.log(`Total pages: ${totalPages}`);

      // Step 3: Flatten blocks and collect texts (페이지별 진행률 표시)
      const flatBlocks = pageBlocks.flat();
      const texts = flatBlocks.map((b) => b.text);

      if (texts.length === 0) {
        console.error('Error: No text blocks found in PDF');
        process.exit(1);
      }

      // Step 4: 번역 (C-5: 진행률 표시 + 재시도)
      console.log(`Translating ${texts.length} text blocks using ${provider}...`);
      const translationService = this.translationServiceFactory.getService(provider);

      // 페이지별로 번역하여 진행률 출력
      const translated: string[] = [];
      for (let pageIdx = 0; pageIdx < pageBlocks.length; pageIdx++) {
        const pageTexts = pageBlocks[pageIdx].map((b) => b.text);
        if (pageTexts.length === 0) {
          printProgress(pageIdx + 1, totalPages, 'pages');
          continue;
        }

        let pageTranslated: string[] | null = null;
        for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
          try {
            pageTranslated = await translationService.translateBatch(
              pageTexts,
              sourceLang,
              targetLang,
              glossaryPath ? { glossaryPath } : undefined,
            );
            break;
          } catch (err: unknown) {
            if (attempt < MAX_RETRY) {
              const msg = err instanceof Error ? err.message : String(err);
              console.log(
                `\nTranslation attempt ${attempt}/${MAX_RETRY} failed for page ${pageIdx + 1}: ${msg}. Retrying...`,
              );
            } else {
              throw err;
            }
          }
        }

        if (pageTranslated) {
          translated.push(...pageTranslated);
        }

        printProgress(pageIdx + 1, totalPages, 'pages');
      }

      // Step 5: Map translations back to blocks (1:1 매핑)
      for (let i = 0; i < flatBlocks.length; i++) {
        flatBlocks[i].translatedText = translated[i];
      }

      // Step 6: Generate output PDF
      console.log('Generating translated PDF...');
      if (mode === OutputMode.REBUILD) {
        await this.pdfRebuildGenerator.rebuild(flatBlocks, outputPath, {
          fontPath,
        });
      } else {
        await this.pdfOverlayGenerator.overlay(buffer, flatBlocks, outputPath, {
          fontPath,
        });
      }

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
