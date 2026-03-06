// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { getBooleanOption, getStringOption, parseArgv } from '../../src/cli/argv';

describe('cli argv parser', () => {
  it('parses long options for project-oriented commands', () => {
    const parsed = parseArgv([
      'generate',
      '--project',
      'comic-hero',
      '--prompt-file=prompt.txt',
      '--count',
      '2',
    ]);

    expect(parsed.positionals[0]).toBe('generate');
    expect(getStringOption(parsed, 'project')).toBe('comic-hero');
    expect(getStringOption(parsed, 'prompt-file')).toBe('prompt.txt');
    expect(getStringOption(parsed, 'count')).toBe('2');
  });

  it('parses short flags', () => {
    const parsed = parseArgv(['-jh']);
    expect(getBooleanOption(parsed, 'json')).toBe(true);
    expect(getBooleanOption(parsed, 'help')).toBe(true);
  });
});
