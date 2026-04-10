import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

export interface CliConfig {
  provider?: string;
  sourceLang?: string;
  targetLang?: string;
  fontPath?: string;
  glossaryPath?: string;
  mode?: string;
}

const CONFIG_FILE_NAME = '.pdf-translator.yml';

export async function loadCliConfig(): Promise<CliConfig> {
  const candidates = [
    path.join(process.cwd(), CONFIG_FILE_NAME),
    path.join(os.homedir(), CONFIG_FILE_NAME),
  ];

  for (const candidate of candidates) {
    try {
      const content = await fs.readFile(candidate, 'utf-8');
      const parsed = yaml.load(content);
      if (parsed && typeof parsed === 'object') {
        return parsed as CliConfig;
      }
    } catch {
      // 파일이 없거나 읽기 실패 시 다음 후보로 이동
    }
  }

  return {};
}
