import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('loadCliConfig', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('설정 파일이 없으면 빈 객체 반환', async () => {
    vi.doMock('fs/promises', () => ({
      readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    }));

    const { loadCliConfig } = await import('./cli-config.loader');
    const config = await loadCliConfig();
    expect(config).toEqual({});
  });

  it('유효한 YAML 파일이 있으면 설정 객체 반환', async () => {
    const yamlContent = `
provider: gemini
sourceLang: en
targetLang: ko
fontPath: /fonts/NotoSans.ttf
glossaryPath: /glossary.yml
mode: rebuild
`;

    vi.doMock('fs/promises', () => ({
      readFile: vi.fn().mockResolvedValueOnce(yamlContent),
    }));

    const { loadCliConfig } = await import('./cli-config.loader');
    const config = await loadCliConfig();
    expect(config).toEqual({
      provider: 'gemini',
      sourceLang: 'en',
      targetLang: 'ko',
      fontPath: '/fonts/NotoSans.ttf',
      glossaryPath: '/glossary.yml',
      mode: 'rebuild',
    });
  });

  it('첫 번째 파일에서 설정 읽기 성공 시 두 번째 파일 읽지 않음', async () => {
    const readFileMock = vi
      .fn()
      .mockResolvedValueOnce('provider: mymemory\n')
      .mockResolvedValueOnce('provider: gemini\n');

    vi.doMock('fs/promises', () => ({
      readFile: readFileMock,
    }));

    const { loadCliConfig } = await import('./cli-config.loader');
    const config = await loadCliConfig();
    expect(config.provider).toBe('mymemory');
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  it('첫 번째 파일 없고 두 번째 파일 있으면 두 번째 파일 사용', async () => {
    const readFileMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce('provider: gemini\n');

    vi.doMock('fs/promises', () => ({
      readFile: readFileMock,
    }));

    const { loadCliConfig } = await import('./cli-config.loader');
    const config = await loadCliConfig();
    expect(config.provider).toBe('gemini');
  });

  it('YAML이 객체가 아니면 빈 객체 반환', async () => {
    vi.doMock('fs/promises', () => ({
      readFile: vi.fn().mockResolvedValueOnce('just a string'),
    }));

    const { loadCliConfig } = await import('./cli-config.loader');
    const config = await loadCliConfig();
    expect(config).toEqual({});
  });
});
