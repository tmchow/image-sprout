import { readFileSync, writeFileSync } from 'node:fs';

import { BUILTIN_IMAGE_MODELS, DEFAULT_MODEL } from '../lib/types';
import type { ImageModelConfig, ModelRegistry, PublicImageModel, PublicModelRegistry } from '../lib/types';
import { CliError } from './errors';
import { ensureAppHome, getModelsPath } from './paths';

interface OpenRouterModelRecord {
  id?: string;
  name?: string;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  input_modalities?: string[];
  output_modalities?: string[];
}

function builtinRegistry(): ModelRegistry {
  return {
    defaultModelId: DEFAULT_MODEL,
    models: BUILTIN_IMAGE_MODELS.map((model) => ({
      ...model,
      source: 'builtin' as const,
    })),
  };
}

function normalizeRegistry(input: Partial<ModelRegistry> | null | undefined): ModelRegistry {
  const base = builtinRegistry();
  const rawModels = Array.isArray(input?.models) ? input.models : base.models;

  const models: ImageModelConfig[] = rawModels
    .filter((model): model is ImageModelConfig => {
      return Boolean(
        model &&
          typeof model.id === 'string' &&
          model.id.trim().length > 0 &&
          typeof model.label === 'string' &&
          model.label.trim().length > 0 &&
          (model.requestFormat === 'image-config' || model.requestFormat === 'openai-size')
      );
    })
    .map((model) => ({
      id: model.id.trim(),
      label: model.label.trim(),
      requestFormat: model.requestFormat,
      source: (model.source === 'user' ? 'user' : 'builtin') as ImageModelConfig['source'],
    }));

  const uniqueModels = models.filter((model, index) => models.findIndex((entry) => entry.id === model.id) === index);
  const defaultModelId =
    typeof input?.defaultModelId === 'string' && uniqueModels.some((model) => model.id === input.defaultModelId)
      ? input.defaultModelId
      : uniqueModels[0]?.id ?? base.defaultModelId;

  return {
    defaultModelId,
    models: uniqueModels.length > 0 ? uniqueModels : base.models,
  };
}

function writeRegistry(registry: ModelRegistry): void {
  ensureAppHome();
  writeFileSync(getModelsPath(), `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
}

export function readModelRegistry(): ModelRegistry {
  try {
    const raw = readFileSync(getModelsPath(), 'utf8');
    return normalizeRegistry(JSON.parse(raw) as ModelRegistry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return builtinRegistry();
    }
    throw new CliError('CONFIG_ERROR', `Failed to read models registry: ${getModelsPath()}`);
  }
}

export function listModelRegistry(): ImageModelConfig[] {
  return readModelRegistry().models;
}

export function toPublicModelConfig(model: ImageModelConfig): PublicImageModel {
  return {
    id: model.id,
    label: model.label,
    source: model.source,
  };
}

export function toPublicModelRegistry(registry: ModelRegistry): PublicModelRegistry {
  return {
    defaultModelId: registry.defaultModelId,
    models: registry.models.map(toPublicModelConfig),
  };
}

export function getDefaultModelId(): string {
  return readModelRegistry().defaultModelId;
}

export function getModelConfig(modelId: string): ImageModelConfig {
  const registry = readModelRegistry();
  const match = registry.models.find((model) => model.id === modelId);
  if (!match) {
    throw new CliError('NOT_FOUND', `Model not found: ${modelId}`, [
      'Run: image-sprout model list',
    ]);
  }
  return match;
}

export function setDefaultModel(modelId: string): ModelRegistry {
  const registry = readModelRegistry();
  if (!registry.models.some((model) => model.id === modelId)) {
    throw new CliError('NOT_FOUND', `Model not found: ${modelId}`, [
      'Run: image-sprout model list',
    ]);
  }
  const next = {
    ...registry,
    defaultModelId: modelId,
  };
  writeRegistry(next);
  return next;
}

function inferRequestFormat(modelId: string): ImageModelConfig['requestFormat'] {
  return modelId.startsWith('openai/') ? 'openai-size' : 'image-config';
}

async function fetchOpenRouterModel(modelId: string, apiKey?: string): Promise<OpenRouterModelRecord | null> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Accept: 'application/json',
        ...(apiKey?.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new CliError('API_ERROR', `OpenRouter models request failed: ${response.status}`, [
        'Verify your OpenRouter API key',
        'Retry after checking network access',
      ]);
    }
    const payload = (await response.json()) as { data?: OpenRouterModelRecord[] };
    const models = Array.isArray(payload.data) ? payload.data : [];
    return models.find((model) => model.id === modelId) ?? null;
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    throw new CliError('API_ERROR', 'Could not validate model against OpenRouter', [
      'Verify network access to OpenRouter',
      'Retry after setting your API key with: image-sprout config set apiKey <key>',
    ]);
  }
}

function modelInputModalities(model: OpenRouterModelRecord): string[] {
  return Array.isArray(model.architecture?.input_modalities)
    ? model.architecture.input_modalities
    : Array.isArray(model.input_modalities)
      ? model.input_modalities
      : [];
}

function modelOutputModalities(model: OpenRouterModelRecord): string[] {
  return Array.isArray(model.architecture?.output_modalities)
    ? model.architecture.output_modalities
    : Array.isArray(model.output_modalities)
      ? model.output_modalities
      : [];
}

function validateOpenRouterImageModel(modelId: string, model: OpenRouterModelRecord | null): OpenRouterModelRecord {
  if (!model) {
    throw new CliError('INVALID_ARGS', `Model not found on OpenRouter: ${modelId}`, [
      'Use a valid OpenRouter model id',
      'Run: image-sprout model list',
    ]);
  }

  const inputModalities = modelInputModalities(model);
  const outputModalities = modelOutputModalities(model);

  if (!inputModalities.includes('text')) {
    throw new CliError('INVALID_ARGS', `Model does not accept text input: ${modelId}`, [
      'Choose a model that supports text prompts',
    ]);
  }

  if (!inputModalities.includes('image')) {
    throw new CliError('INVALID_ARGS', `Model does not accept image input: ${modelId}`, [
      'Choose a model that supports image references',
    ]);
  }

  if (!outputModalities.includes('image')) {
    throw new CliError('INVALID_ARGS', `Model does not generate images: ${modelId}`, [
      'Choose a model with image output support',
    ]);
  }

  return model;
}

export async function addModelToRegistry(params: {
  id: string;
  label?: string;
  requestFormat?: ImageModelConfig['requestFormat'];
  apiKey?: string;
}): Promise<ImageModelConfig> {
  const id = params.id.trim();
  if (!id) {
    throw new CliError('INVALID_ARGS', 'Model id is required');
  }

  const registry = readModelRegistry();
  if (registry.models.some((model) => model.id === id)) {
    throw new CliError('INVALID_ARGS', `Model already exists: ${id}`);
  }

  const fetched = validateOpenRouterImageModel(id, await fetchOpenRouterModel(id, params.apiKey));
  const model: ImageModelConfig = {
    id,
    label: params.label?.trim() || fetched?.name?.trim() || id,
    requestFormat: params.requestFormat ?? inferRequestFormat(id),
    source: 'user',
  };

  const next = {
    ...registry,
    models: [...registry.models, model],
  };
  writeRegistry(next);
  return model;
}

export function updateModelInRegistry(
  modelId: string,
  changes: Partial<Pick<ImageModelConfig, 'label' | 'requestFormat'>>
): ImageModelConfig {
  const registry = readModelRegistry();
  const match = registry.models.find((model) => model.id === modelId);
  if (!match) {
    throw new CliError('NOT_FOUND', `Model not found: ${modelId}`);
  }

  const nextModel: ImageModelConfig = {
    ...match,
    ...(changes.label !== undefined ? { label: changes.label.trim() || match.label } : {}),
    ...(changes.requestFormat !== undefined ? { requestFormat: changes.requestFormat } : {}),
  };
  const next = {
    ...registry,
    models: registry.models.map((model) => (model.id === modelId ? nextModel : model)),
  };
  writeRegistry(next);
  return nextModel;
}

export function removeModelFromRegistry(modelId: string): ModelRegistry {
  const registry = readModelRegistry();
  const match = registry.models.find((model) => model.id === modelId);
  if (!match) {
    throw new CliError('NOT_FOUND', `Model not found: ${modelId}`);
  }
  if (match.source === 'builtin') {
    throw new CliError('INVALID_ARGS', `Built-in model cannot be removed: ${modelId}`, [
      'Use: image-sprout model restore-defaults',
    ]);
  }

  const models = registry.models.filter((model) => model.id !== modelId);
  const next = {
    defaultModelId: registry.defaultModelId === modelId ? (models[0]?.id ?? DEFAULT_MODEL) : registry.defaultModelId,
    models,
  };
  writeRegistry(next);
  return next;
}

export function restoreDefaultModels(): ModelRegistry {
  const registry = builtinRegistry();
  writeRegistry(registry);
  return registry;
}
