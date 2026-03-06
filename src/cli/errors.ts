export const EXIT_CODES = {
  SUCCESS: 0,
  NOT_FOUND: 1,
  INVALID_ARGS: 2,
  CONFIG_ERROR: 3,
  AUTH_REQUIRED: 4,
  API_ERROR: 5,
  IO_ERROR: 6,
  INTERNAL_ERROR: 7,
} as const;

const CODE_TO_EXIT: Record<string, number> = {
  NOT_FOUND: EXIT_CODES.NOT_FOUND,
  INVALID_ARGS: EXIT_CODES.INVALID_ARGS,
  CONFIG_ERROR: EXIT_CODES.CONFIG_ERROR,
  AUTH_REQUIRED: EXIT_CODES.AUTH_REQUIRED,
  API_ERROR: EXIT_CODES.API_ERROR,
  IO_ERROR: EXIT_CODES.IO_ERROR,
  INTERNAL_ERROR: EXIT_CODES.INTERNAL_ERROR,
};

export class CliError extends Error {
  code: string;
  suggestions: string[];
  exitCode: number;

  constructor(code: string, message: string, suggestions: string[] = []) {
    super(message);
    this.code = code;
    this.suggestions = suggestions;
    this.exitCode = CODE_TO_EXIT[code] ?? EXIT_CODES.INTERNAL_ERROR;
  }
}

export function asCliError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }

  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes('API key is required')) {
      return new CliError('AUTH_REQUIRED', 'API key is required', [
        'Run: image-sprout config set apiKey <key>',
      ]);
    }
    if (msg.includes('OpenRouter API error')) {
      return new CliError('API_ERROR', msg, [
        'Verify API key and model access',
        'Retry with fewer images: --count 1',
      ]);
    }
    return new CliError('INTERNAL_ERROR', msg || 'Unknown error', ['Retry with --json for full details']);
  }

  return new CliError('INTERNAL_ERROR', 'Unknown error', ['Retry command']);
}
