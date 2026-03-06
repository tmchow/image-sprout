import type { ImageModel, SizePreset } from '../lib/types';

export interface CliConfig {
  apiKey: string;
  model: ImageModel;
  sizePreset: SizePreset;
  imageCount: number;
}

export interface PublicCliConfig {
  apiKeyConfigured: boolean;
  model: ImageModel;
  sizePreset: SizePreset;
  imageCount: number;
}

export interface CommandContext {
  command: string;
  json: boolean;
  version: string;
  ids: boolean;
  limit?: number;
  valuePath?: string;
}

export interface CliSuccess<T> {
  ok: true;
  command: string;
  data: T;
}

export interface CliFailure {
  ok: false;
  command: string;
  error: {
    code: string;
    message: string;
    suggestions: string[];
  };
}

export interface ParsedArgv {
  positionals: string[];
  options: Map<string, string | boolean | string[]>;
}
