import { readFileSync, writeFileSync } from 'node:fs';

import { CliError } from './errors';
import { ensureAppHome, getConfigPath } from './paths';
import { getDefaultModelId, listModelRegistry } from './model-registry';
import { SUPPORTED_IMAGE_COUNTS } from '../lib/types';

export { getConfigPath } from './paths';
import type { CliConfig, PublicCliConfig } from './types';

const CONFIG_KEYS = new Set(['apiKey', 'model', 'sizePreset', 'imageCount', 'analysisModel']);

function defaultConfig(): CliConfig {
  return {
    apiKey: '',
    model: getDefaultModelId(),
    sizePreset: '16:9',
    imageCount: 4,
  };
}

function parseConfig(): Partial<CliConfig> {
  const target = getConfigPath();
  try {
    const raw = readFileSync(target, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }

    throw new CliError('CONFIG_ERROR', `Failed to read config: ${target}`, [
      'Run: image-sprout config show',
      'Fix malformed JSON in config file',
    ]);
  }
}

export function readConfig(): CliConfig {
  const parsed = parseConfig();

  const defaults = defaultConfig();
  const config: CliConfig = {
    ...defaults,
    ...parsed,
  };

  const models = listModelRegistry();
  if (!models.some((entry) => entry.id === config.model)) {
    const healed: CliConfig = {
      ...config,
      model: defaults.model,
    };
    writeConfig(healed);
    return healed;
  }

  if (!['16:9', '1:1', '9:16'].includes(config.sizePreset)) {
    throw new CliError('CONFIG_ERROR', `Invalid configured sizePreset: ${String(config.sizePreset)}`, [
      'Use one of: 16:9, 1:1, 9:16',
    ]);
  }

  if (!SUPPORTED_IMAGE_COUNTS.includes(config.imageCount as (typeof SUPPORTED_IMAGE_COUNTS)[number])) {
    const healed: CliConfig = {
      ...config,
      imageCount: defaults.imageCount,
    };
    writeConfig(healed);
    return healed;
  }

  return config;
}

function normalizeKey(input: string): keyof CliConfig {
  if (CONFIG_KEYS.has(input)) {
    return input as keyof CliConfig;
  }

  const alias: Record<string, keyof CliConfig> = {
    'api-key': 'apiKey',
    key: 'apiKey',
    size: 'sizePreset',
    count: 'imageCount',
    model: 'model',
  };

  const mapped = alias[input];
  if (mapped) {
    return mapped;
  }

  throw new CliError('INVALID_ARGS', `Unknown config key: ${input}`, [
    'Valid keys: apiKey, model, sizePreset, imageCount, analysisModel',
  ]);
}

function validateSetValue(key: keyof CliConfig, rawValue: string): CliConfig[keyof CliConfig] {
  switch (key) {
    case 'apiKey':
      return rawValue.trim();
    case 'model': {
      if (!listModelRegistry().some((entry) => entry.id === rawValue)) {
        throw new CliError('INVALID_ARGS', `Unknown model: ${rawValue}`, [
          'Run: image-sprout model list',
        ]);
      }
      return rawValue;
    }
    case 'sizePreset': {
      if (rawValue !== '16:9' && rawValue !== '1:1' && rawValue !== '9:16') {
        throw new CliError('INVALID_ARGS', `Invalid size preset: ${rawValue}`, [
          'Use one of: 16:9, 1:1, 9:16',
        ]);
      }
      return rawValue;
    }
    case 'imageCount': {
      const value = Number(rawValue);
      if (!SUPPORTED_IMAGE_COUNTS.includes(value as (typeof SUPPORTED_IMAGE_COUNTS)[number])) {
        throw new CliError('INVALID_ARGS', `imageCount must be one of: ${SUPPORTED_IMAGE_COUNTS.join(', ')}`, [
          'Example: image-sprout config set imageCount 4',
        ]);
      }
      return value;
    }
    case 'analysisModel': {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        throw new CliError('INVALID_ARGS', 'analysisModel must be a non-empty model ID');
      }
      return trimmed;
    }
    default:
      throw new CliError('INVALID_ARGS', `Unsupported config key: ${String(key)}`);
  }
}

function writeConfig(config: CliConfig): void {
  ensureAppHome();
  const file = getConfigPath();
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export function publicConfig(config: CliConfig): PublicCliConfig {
  return {
    apiKeyConfigured: config.apiKey.trim().length > 0,
    model: config.model,
    sizePreset: config.sizePreset,
    imageCount: config.imageCount,
    ...(config.analysisModel ? { analysisModel: config.analysisModel } : {}),
  };
}

export function updateConfig(changes: Partial<CliConfig>): CliConfig {
  const current = readConfig();
  const next: CliConfig = {
    ...current,
    ...changes,
  };
  writeConfig(next);
  return next;
}

export function configShow(): PublicCliConfig {
  return publicConfig(readConfig());
}

export function configGet(
  inputKey: string
): { key: keyof CliConfig; value?: CliConfig[keyof CliConfig]; configured?: boolean } {
  const key = normalizeKey(inputKey);
  const config = readConfig();
  if (key === 'apiKey') {
    return { key, configured: config.apiKey.trim().length > 0 };
  }
  return { key, value: config[key] };
}

export function configSet(inputKey: string, rawValue: string): CliConfig {
  const key = normalizeKey(inputKey);
  const current = readConfig();
  const next: CliConfig = {
    ...current,
    [key]: validateSetValue(key, rawValue),
  };
  writeConfig(next);
  return next;
}

export function configUnset(inputKey: string): CliConfig {
  const key = normalizeKey(inputKey);
  const current = readConfig();
  const defaults = defaultConfig();
  const next: CliConfig = {
    ...current,
    [key]: defaults[key],
  };
  writeConfig(next);
  return next;
}
