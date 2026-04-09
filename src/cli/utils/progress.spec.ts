import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderProgressBar, printProgress } from './progress';

describe('renderProgressBar', () => {
  it('0/10 진행률: 빈 바 출력', () => {
    const result = renderProgressBar(0, 10, 'pages');
    expect(result).toContain('0/10 pages');
    expect(result).toMatch(/^\[/);
  });

  it('5/10 진행률: 절반 채워진 바 출력', () => {
    const result = renderProgressBar(5, 10, 'pages');
    expect(result).toContain('5/10 pages');
    expect(result).toContain('=');
  });

  it('10/10 진행률: 꽉 찬 바 출력', () => {
    const result = renderProgressBar(10, 10, 'pages');
    expect(result).toContain('10/10 pages');
    // 꽉 찬 경우 '>' 없이 '='만 채워짐
    expect(result).not.toContain('>');
  });

  it('total=0 시 크래시 없이 처리', () => {
    expect(() => renderProgressBar(0, 0, 'pages')).not.toThrow();
  });

  it('포맷: [bar] current/total label 형식', () => {
    const result = renderProgressBar(3, 10, 'pages', 20);
    expect(result).toMatch(/^\[.{20}\] 3\/10 pages$/);
  });
});

describe('printProgress', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('진행 중: \\r로 시작하는 텍스트 출력', () => {
    printProgress(3, 10, 'pages');
    expect(writeSpy).toHaveBeenCalledWith(expect.stringMatching(/^\r/));
  });

  it('완료(current === total): \\n 추가 출력', () => {
    printProgress(10, 10, 'pages');
    expect(writeSpy).toHaveBeenCalledTimes(2);
    expect(writeSpy).toHaveBeenLastCalledWith('\n');
  });

  it('미완료 시: \\n 미출력', () => {
    printProgress(5, 10, 'pages');
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });
});
