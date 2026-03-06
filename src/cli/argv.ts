import { CliError } from './errors';
import type { ParsedArgv } from './types';

function pushOption(
  options: Map<string, string | boolean | string[]>,
  key: string,
  value: string | boolean
): void {
  const prev = options.get(key);
  if (prev === undefined) {
    options.set(key, value);
    return;
  }

  if (Array.isArray(prev)) {
    prev.push(String(value));
    options.set(key, prev);
    return;
  }

  options.set(key, [String(prev), String(value)]);
}

export function parseArgv(argv: string[]): ParsedArgv {
  const positionals: string[] = [];
  const options = new Map<string, string | boolean | string[]>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (token.startsWith('--')) {
      const body = token.slice(2);
      if (!body) {
        throw new CliError('INVALID_ARGS', 'Invalid option "--"', ['Run: image-sprout help']);
      }

      const eqIndex = body.indexOf('=');
      if (eqIndex >= 0) {
        const key = body.slice(0, eqIndex);
        const value = body.slice(eqIndex + 1);
        pushOption(options, key, value);
        continue;
      }

      if (body.startsWith('no-')) {
        pushOption(options, body.slice(3), false);
        continue;
      }

      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        pushOption(options, body, next);
        i += 1;
      } else {
        pushOption(options, body, true);
      }
      continue;
    }

    if (token.startsWith('-') && token.length > 1) {
      const shorts = token.slice(1).split('');
      for (const flag of shorts) {
        if (flag === 'j') {
          pushOption(options, 'json', true);
        } else if (flag === 'h') {
          pushOption(options, 'help', true);
        } else if (flag === 'v') {
          pushOption(options, 'version', true);
        } else {
          throw new CliError('INVALID_ARGS', `Unknown short flag -${flag}`, [
            'Supported short flags: -j -h -v',
          ]);
        }
      }
      continue;
    }

    positionals.push(token);
  }

  return { positionals, options };
}

export function hasOption(args: ParsedArgv, key: string): boolean {
  return args.options.has(key);
}

export function getStringOption(args: ParsedArgv, key: string): string | undefined {
  const value = args.options.get(key);
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  if (typeof value === 'string') {
    return value;
  }
  return value ? 'true' : 'false';
}

export function getArrayOption(args: ParsedArgv, key: string): string[] {
  const value = args.options.get(key);
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return [String(value)];
}

export function getBooleanOption(args: ParsedArgv, key: string): boolean | undefined {
  const value = args.options.get(key);
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    const last = value[value.length - 1];
    return parseBoolean(last, key);
  }
  return parseBoolean(value, key);
}

function parseBoolean(input: string, key: string): boolean {
  const normalized = input.toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  throw new CliError('INVALID_ARGS', `Expected boolean value for --${key}`, [
    `Use: --${key} true|false`,
  ]);
}
