import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CliError } from './errors';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function readFileAsDataUrl(filePath: string): string {
  let content: Buffer;
  try {
    content = readFileSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CliError('NOT_FOUND', `Reference file not found: ${filePath}`, [
        'Check --ref file paths',
      ]);
    }
    throw new CliError('IO_ERROR', `Failed reading file: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    throw new CliError('INVALID_ARGS', `Unsupported reference image extension: ${ext || '(none)'}`, [
      'Use .png, .jpg, .jpeg, .webp, or .gif',
    ]);
  }

  return `data:${mime};base64,${content.toString('base64')}`;
}

export async function readPromptFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8').trim()));
    process.stdin.on('error', () => reject(new CliError('IO_ERROR', 'Failed reading stdin')));
  });
}

async function downloadImage(url: string): Promise<{ mimeType: string; buffer: Buffer }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new CliError('API_ERROR', `Failed downloading generated image: ${response.status}`);
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0] ?? 'image/png';
  const arrayBuffer = await response.arrayBuffer();
  return { mimeType, buffer: Buffer.from(arrayBuffer) };
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new CliError('IO_ERROR', 'Invalid data URL received from API');
  }
  const [, mimeType, base64] = match;
  return {
    mimeType,
    buffer: Buffer.from(base64, 'base64'),
  };
}

function fileExtForMime(mimeType: string): string {
  return EXT_BY_MIME[mimeType] ?? 'png';
}

export function mimeTypeForFilePath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    throw new CliError('INVALID_ARGS', `Unsupported reference image extension: ${ext || '(none)'}`, [
      'Use .png, .jpg, .jpeg, .webp, or .gif',
    ]);
  }
  return mime;
}

export function extForMimeType(mimeType: string): string {
  return fileExtForMime(mimeType);
}

export async function persistGeneratedImage(
  imageData: string,
  outDir: string,
  runId: string,
  index: number
): Promise<{ path: string; mimeType: string }> {
  mkdirSync(outDir, { recursive: true });

  let mimeType = 'image/png';
  let buffer: Buffer;

  if (imageData.startsWith('data:')) {
    const parsed = parseDataUrl(imageData);
    mimeType = parsed.mimeType;
    buffer = parsed.buffer;
  } else if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
    const downloaded = await downloadImage(imageData);
    mimeType = downloaded.mimeType;
    buffer = downloaded.buffer;
  } else {
    throw new CliError('IO_ERROR', 'Unsupported image payload from API');
  }

  const ext = fileExtForMime(mimeType);
  const filename = `${runId}-${String(index + 1).padStart(2, '0')}.${ext}`;
  const target = path.resolve(outDir, filename);
  writeFileSync(target, buffer);

  return { path: target, mimeType };
}

export async function readPrompt(
  promptArg: string | undefined,
  promptFile: string | undefined
): Promise<string> {
  const fromArg = promptArg?.trim();
  if (fromArg) {
    return fromArg;
  }

  if (promptFile) {
    try {
      return readFileSync(promptFile, 'utf8').trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new CliError('NOT_FOUND', `Prompt file not found: ${promptFile}`, [
          'Check --prompt-file path',
        ]);
      }
      throw new CliError('IO_ERROR', `Failed reading prompt file: ${promptFile}`);
    }
  }

  return readPromptFromStdin();
}
