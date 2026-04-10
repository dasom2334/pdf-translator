import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GlossaryService } from './glossary.service';

// Mock 'fs' module before imports that use it
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

import * as fs from 'fs';

describe('GlossaryService', () => {
  let service: GlossaryService;

  beforeEach(() => {
    // Fresh service instance and reset mocks to avoid cache pollution
    service = new GlossaryService();
    vi.mocked(fs.readFileSync).mockReset();
  });

  describe('loadGlossary', () => {
    it('should load a JSON glossary file', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({ terms: { Google: 'Google', OpenAI: 'OpenAI' } }),
      );

      const terms = service.loadGlossary('/fake/glossary.json');
      expect(terms).toMatchObject({ Google: 'Google', OpenAI: 'OpenAI' });
    });

    it('should return empty object when file cannot be read', () => {
      vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
        throw new Error('ENOENT: no such file');
      });

      const terms = service.loadGlossary('/nonexistent/path.json');
      expect(terms).toEqual({});
    });

    it('should return empty object when file has invalid JSON', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('not valid json {{');

      const terms = service.loadGlossary('/fake/bad.json');
      expect(terms).toEqual({});
    });

    it('should return empty object when "terms" field is missing', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({ other: { key: 'value' } }),
      );

      const terms = service.loadGlossary('/fake/no-terms.json');
      expect(terms).toEqual({});
    });

    it('should cache results for the same path', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ terms: { Adobe: 'Adobe' } }),
      );

      service.loadGlossary('/fake/cached.json');
      service.loadGlossary('/fake/cached.json');

      // File should only be read once due to caching
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('substitute', () => {
    it('should replace known terms with placeholders', () => {
      const terms = { Google: 'Google', OpenAI: 'OpenAI' };
      const { text, placeholders } = service.substitute(
        'I use Google and OpenAI.',
        terms,
      );

      expect(text).not.toContain('Google');
      expect(text).not.toContain('OpenAI');
      expect(placeholders.size).toBe(2);
    });

    it('should return original text when terms map is empty', () => {
      const { text, placeholders } = service.substitute('Hello world', {});
      expect(text).toBe('Hello world');
      expect(placeholders.size).toBe(0);
    });

    it('should replace all occurrences of a term', () => {
      const terms = { API: 'API' };
      const { text } = service.substitute('The API is a REST API.', terms);
      expect(text).not.toContain('API');
    });

    it('should prefer longer terms over shorter ones (avoid partial match)', () => {
      const terms = { Node: 'Node', 'Node.js': 'Node.js' };
      const { text, placeholders } = service.substitute('I use Node.js.', terms);
      // Node.js should be matched as a unit, not Node + .js
      const restored = service.restore(text, placeholders);
      expect(restored).toBe('I use Node.js.');
    });
  });

  describe('substitute - 플레이스홀더 충돌 방지', () => {
    it('플레이스홀더가 UUID 기반으로 생성되어야 한다', () => {
      const terms = { Google: 'Google' };
      const { placeholders } = service.substitute('Use Google search', terms);
      const [placeholder] = placeholders.keys();
      // UUID 패턴: \x00GTERM_{uuid}\x00
      expect(placeholder).toMatch(/^\x00GTERM_[0-9a-f-]{36}\x00$/);
    });

    it('원본 텍스트에 §TERM0§가 있어도 플레이스홀더와 충돌하지 않아야 한다', () => {
      const terms = { Google: 'Google' };
      const originalText = '§TERM0§ and Google search';
      const { text, placeholders } = service.substitute(originalText, terms);

      // 플레이스홀더가 §TERM0§과 달라야 함
      const placeholder = [...placeholders.keys()][0];
      expect(placeholder).not.toBe('§TERM0§');

      // restore 후 §TERM0§ 리터럴은 원형 유지
      const restored = service.restore(text, placeholders);
      expect(restored).toContain('§TERM0§');
      expect(restored).toContain('Google');
    });

    it('같은 용어가 여러 번 등장해도 모두 복원되어야 한다', () => {
      const terms = { API: 'API' };
      const { text, placeholders } = service.substitute('API and API again', terms);
      const restored = service.restore(text, placeholders);
      expect(restored).toBe('API and API again');
    });

    it('여러 용어가 각각 다른 UUID 플레이스홀더를 가져야 한다', () => {
      const terms = { Google: 'Google', API: 'API' };
      const { placeholders } = service.substitute('Google API', terms);
      const keys = [...placeholders.keys()];
      expect(keys.length).toBe(2);
      expect(keys[0]).not.toBe(keys[1]);
    });
  });

  describe('restore', () => {
    it('should restore placeholders to original terms', () => {
      const terms = { Google: 'Google' };
      const { text, placeholders } = service.substitute('Hello Google', terms);
      const restored = service.restore(text, placeholders);
      expect(restored).toBe('Hello Google');
    });

    it('should handle multiple placeholders', () => {
      const terms = { Google: 'Google', Apple: 'Apple' };
      const { text, placeholders } = service.substitute(
        'Google and Apple are companies.',
        terms,
      );
      const restored = service.restore(text, placeholders);
      expect(restored).toBe('Google and Apple are companies.');
    });

    it('should return text unchanged when placeholders map is empty', () => {
      const result = service.restore('Hello world', new Map());
      expect(result).toBe('Hello world');
    });
  });
});
