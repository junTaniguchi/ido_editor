import { describe, expect, it } from 'vitest';

import { normalizeMermaidSource } from '../normalize';

describe('normalizeMermaidSource', () => {
  it('keeps flowchart headers untouched except trimming orientation case', () => {
    const source = 'flowchart td\n  A-->B';
    expect(normalizeMermaidSource(source)).toBe('flowchart TD\n  A-->B');
  });

  it('ensures gitGraph headers include the trailing colon', () => {
    const source = 'gitGraph LR\n  commit';
    const normalized = normalizeMermaidSource(source);
    expect(normalized.startsWith('gitGraph LR:')).toBe(true);
  });

  it('defaults gitGraph orientation to LR when missing', () => {
    const source = '  gitGraph\n  commit';
    const normalized = normalizeMermaidSource(source);
    expect(normalized.startsWith('gitGraph LR:')).toBe(true);
  });

  it('preserves additional header content on a new line', () => {
    const source = 'gitGraph tb options { test: true }\ncommit';
    const normalized = normalizeMermaidSource(source);
    expect(normalized.split('\n')[0]).toBe('gitGraph TB:');
    expect(normalized.split('\n')[1]).toBe('options { test: true }');
  });
});
