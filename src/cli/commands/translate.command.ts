import { Command, CommandRunner, Option } from 'nest-commander';

interface TranslateCommandOptions {
  input: string;
  target: string;
  source?: string;
  output?: string;
  provider?: string;
  mode?: string;
  font?: string;
  pages?: string;
}

@Command({
  name: 'translate',
  description: 'Translate a PDF file',
})
export class TranslateCommand extends CommandRunner {
  @Option({ flags: '-i, --input <path>', description: 'Input PDF file path', required: true })
  parseInput(val: string): string {
    return val;
  }

  @Option({ flags: '-t, --target <lang>', description: 'Target language code', required: true })
  parseTarget(val: string): string {
    return val;
  }

  @Option({ flags: '-s, --source <lang>', description: 'Source language code' })
  parseSource(val: string): string {
    return val;
  }

  @Option({ flags: '-o, --output <path>', description: 'Output PDF file path' })
  parseOutput(val: string): string {
    return val;
  }

  @Option({ flags: '-p, --provider <provider>', description: 'Translation provider (mymemory|gemini)', defaultValue: 'mymemory' })
  parseProvider(val: string): string {
    return val;
  }

  @Option({ flags: '--mode <mode>', description: 'Output mode (overlay|rebuild)', defaultValue: 'overlay' })
  parseMode(val: string): string {
    return val;
  }

  @Option({ flags: '--font <path>', description: 'Path to TTF font file' })
  parseFont(val: string): string {
    return val;
  }

  @Option({ flags: '--pages <range>', description: 'Page range to translate (e.g. "1-5,10")' })
  parsePages(val: string): string {
    return val;
  }

  async run(_passedParams: string[], _options?: TranslateCommandOptions): Promise<void> {
    throw new Error('Not implemented: Phase 1');
  }
}
