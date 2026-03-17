import { Command, CommandRunner, Option } from 'nest-commander';
import { NotImplementedException } from '@nestjs/common';

interface TranslateCommandOptions {
  input: string;
  target: string;
  source?: string;
  output?: string;
  provider?: string;
  font?: string;
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

  @Option({ flags: '-p, --provider <name>', description: 'Translation provider (mymemory|gemini)' })
  parseProvider(val: string): string {
    return val;
  }

  @Option({ flags: '--font <path>', description: 'Path to TTF font file' })
  parseFont(val: string): string {
    return val;
  }

  async run(_passedParams: string[], _options?: TranslateCommandOptions): Promise<void> {
    throw new NotImplementedException('Phase 1');
  }
}
