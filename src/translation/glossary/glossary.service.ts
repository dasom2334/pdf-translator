import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';

/**
 * A placeholder token wrapping a glossary term index.
 * Format: __GLOSS_<index>__
 * Chosen to be unlikely to appear in natural text.
 */
const PLACEHOLDER_PREFIX = '__GLOSS_';
const PLACEHOLDER_SUFFIX = '__';

function makePlaceholder(index: number): string {
  return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
}

/**
 * Very small YAML list-under-key parser.
 * Handles only the subset used by default-glossary.yaml:
 *   terms:
 *     - Item
 *     - Item
 * Lines starting with '#' or blank are ignored.
 */
function parseGlossaryYaml(content: string): string[] {
  const lines = content.split('\n');
  const terms: string[] = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    // Skip comments and blank lines
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }
    if (/^terms\s*:/.test(line)) {
      inList = true;
      continue;
    }
    if (inList) {
      const match = /^\s+-\s+(.+)$/.exec(line);
      if (match) {
        terms.push(match[1].trim());
      } else if (/^\S/.test(line)) {
        // New top-level key — stop parsing list
        inList = false;
      }
    }
  }

  return terms;
}

function loadGlossaryTerms(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') {
    const parsed = JSON.parse(content) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'terms' in parsed &&
      Array.isArray((parsed as { terms: unknown }).terms)
    ) {
      return ((parsed as { terms: unknown[] }).terms as unknown[])
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }
    return [];
  }

  // Default: treat as YAML
  return parseGlossaryYaml(content);
}

export interface GlossarySubstitution {
  text: string;
  /** Ordered list of original terms corresponding to placeholder indices */
  terms: string[];
}

@Injectable()
export class GlossaryService {
  private readonly logger = new Logger(GlossaryService.name);

  /**
   * Load and sort glossary terms (longest first to avoid partial replacement).
   */
  loadTerms(glossaryPath: string): string[] {
    try {
      const terms = loadGlossaryTerms(glossaryPath);
      // Sort longest first to avoid shorter terms matching inside longer ones
      return terms.sort((a, b) => b.length - a.length);
    } catch (err) {
      this.logger.warn(
        `Failed to load glossary from ${glossaryPath}: ${(err as Error).message}. Proceeding without glossary.`,
      );
      return [];
    }
  }

  /**
   * Replace all glossary terms in text with numbered placeholders.
   * Returns the substituted text and the term list for restoration.
   *
   * Uses case-sensitive whole-word matching so "iOS" is not matched inside "macOS".
   */
  substitute(text: string, terms: string[]): GlossarySubstitution {
    if (terms.length === 0) {
      return { text, terms: [] };
    }

    const foundTerms: string[] = [];
    let result = text;

    for (const term of terms) {
      // Escape special regex characters
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Word-boundary aware: use lookahead/lookbehind for non-word chars or start/end
      const regex = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'g');

      if (regex.test(result)) {
        // Reset lastIndex after test
        regex.lastIndex = 0;
        const index = foundTerms.length;
        foundTerms.push(term);
        const placeholder = makePlaceholder(index);
        result = result.replace(regex, placeholder);
      }
    }

    return { text: result, terms: foundTerms };
  }

  /**
   * Restore placeholders back to original terms.
   */
  restore(text: string, terms: string[]): string {
    if (terms.length === 0) {
      return text;
    }

    let result = text;
    for (let i = 0; i < terms.length; i++) {
      const placeholder = makePlaceholder(i);
      // The translation engine may have altered surrounding whitespace; replace globally.
      result = result.split(placeholder).join(terms[i]);
    }

    return result;
  }
}
