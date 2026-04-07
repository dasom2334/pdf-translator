import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { extname } from 'path';

export interface GlossaryEntry {
  [term: string]: string;
}

export interface GlossaryFile {
  terms: GlossaryEntry;
}

export interface GlossarySubstitution {
  text: string;
  placeholders: Map<string, string>;
}

const PLACEHOLDER_PREFIX = '§TERM';
const PLACEHOLDER_SUFFIX = '§';

@Injectable()
export class GlossaryService {
  private readonly logger = new Logger(GlossaryService.name);
  private readonly cache = new Map<string, GlossaryEntry>();

  loadGlossary(glossaryPath: string): GlossaryEntry {
    if (this.cache.has(glossaryPath)) {
      return this.cache.get(glossaryPath)!;
    }

    let raw: string;
    try {
      raw = readFileSync(glossaryPath, 'utf-8');
    } catch (error) {
      this.logger.warn(
        `Failed to read glossary file at ${glossaryPath}: ${(error as Error).message}`,
      );
      return {};
    }

    const ext = extname(glossaryPath).toLowerCase();
    let parsed: GlossaryFile;

    try {
      if (ext === '.yaml' || ext === '.yml') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const jsYaml = require('js-yaml') as { load: (s: string) => unknown };
        parsed = jsYaml.load(raw) as GlossaryFile;
      } else {
        parsed = JSON.parse(raw) as GlossaryFile;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to parse glossary file at ${glossaryPath}: ${(error as Error).message}`,
      );
      return {};
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.terms) {
      this.logger.warn(`Glossary file at ${glossaryPath} has no "terms" field`);
      return {};
    }

    const terms: GlossaryEntry = {};
    for (const [key, val] of Object.entries(parsed.terms)) {
      if (typeof key === 'string' && typeof val === 'string') {
        terms[key] = val;
      }
    }

    this.cache.set(glossaryPath, terms);
    return terms;
  }

  /**
   * Replace glossary terms in text with unique placeholders.
   * Returns the modified text and a reverse-lookup map from placeholder -> original term.
   */
  substitute(text: string, terms: GlossaryEntry): GlossarySubstitution {
    const placeholders = new Map<string, string>();

    // Sort terms by length descending to match longer terms first
    const sortedTerms = Object.keys(terms).sort((a, b) => b.length - a.length);

    let result = text;
    let index = 0;

    for (const term of sortedTerms) {
      const preserved = terms[term];
      const placeholder = `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
      // Use a global, case-sensitive regex to replace all occurrences
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      if (regex.test(result)) {
        result = result.replace(regex, placeholder);
        placeholders.set(placeholder, preserved);
        index++;
      }
    }

    return { text: result, placeholders };
  }

  /**
   * Restore placeholders back to their original (preserved) terms.
   */
  restore(text: string, placeholders: Map<string, string>): string {
    let result = text;
    for (const [placeholder, original] of placeholders.entries()) {
      const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), original);
    }
    return result;
  }
}
