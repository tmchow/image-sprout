import type { PublicImageModel, PublicModelRegistry, PublicConfig, SizePreset, ImageModel } from '../types';
import { BUILTIN_IMAGE_MODELS, DEFAULT_MODEL } from '../types';
import {
  addModelRequest,
  getBootstrap,
  listModelsRequest,
  removeModelRequest,
  restoreDefaultModelsRequest,
  setDefaultModelRequest,
  updateConfig,
  updateModelRequest,
} from '../api/local-bridge';

let apiKeyConfigured = $state(false);
let sizePreset = $state<SizePreset>('16:9');
let imageCount = $state<number>(4);
let model = $state<ImageModel>(DEFAULT_MODEL);
let availableModels = $state<PublicImageModel[]>(BUILTIN_IMAGE_MODELS.map((entry) => ({
  id: entry.id,
  label: entry.label,
  source: 'builtin' as const,
})));
let defaultModelId = $state<ImageModel>(DEFAULT_MODEL);
let ready = $state(false);
let loading = $state(false);
let loadError = $state<string | null>(null);

export async function loadSettings(): Promise<void> {
  loading = true;
  try {
    const bootstrap = await getBootstrap();
    apiKeyConfigured = bootstrap.config.apiKeyConfigured;
    sizePreset = bootstrap.config.sizePreset;
    imageCount = bootstrap.config.imageCount;
    model = bootstrap.config.model;
    applyModelRegistry(bootstrap.modelRegistry);
    loadError = null;
    ready = true;
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Failed to load settings';
    ready = true;
  } finally {
    loading = false;
  }
}

function applyPublicConfig(next: PublicConfig): void {
  apiKeyConfigured = next.apiKeyConfigured;
  sizePreset = next.sizePreset;
  imageCount = next.imageCount;
  model = next.model;
}

function applyModelRegistry(registry: PublicModelRegistry): void {
  availableModels = registry.models;
  defaultModelId = registry.defaultModelId;
  if (!availableModels.some((entry) => entry.id === model)) {
    model = defaultModelId;
  }
}

async function persist(changes: Partial<{ apiKey: string; sizePreset: SizePreset; imageCount: number; model: ImageModel }>): Promise<void> {
  try {
    const next = await updateConfig(changes);
    applyPublicConfig(next);
    loadError = null;
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Failed to save settings';
    throw error;
  }
}

export function setApiKey(key: string): Promise<void> {
  apiKeyConfigured = key.trim().length > 0;
  return persist({ apiKey: key });
}

export function clearApiKey(): Promise<void> {
  apiKeyConfigured = false;
  return persist({ apiKey: '' });
}

export function setSizePreset(preset: SizePreset): Promise<void> {
  sizePreset = preset;
  return persist({ sizePreset: preset });
}

export function setImageCount(n: number): Promise<void> {
  imageCount = n;
  return persist({ imageCount: n });
}

export function setModel(m: ImageModel): Promise<void> {
  model = m;
  return persist({ model: m });
}

export async function refreshModels(): Promise<void> {
  applyModelRegistry(await listModelsRequest());
}

export async function addModel(params: {
  id: string;
  label?: string;
}): Promise<void> {
  await addModelRequest(params);
  await refreshModels();
}

export async function updateModel(
  modelId: string,
  changes: Partial<Pick<PublicImageModel, 'label'>>
): Promise<void> {
  await updateModelRequest(modelId, changes);
  await refreshModels();
}

export async function removeModel(modelId: string): Promise<void> {
  const registry = await removeModelRequest(modelId);
  applyModelRegistry(registry);
  if (model === modelId) {
    model = registry.defaultModelId;
  }
}

export async function setDefaultModel(modelId: string): Promise<void> {
  const registry = await setDefaultModelRequest(modelId);
  applyModelRegistry(registry);
  model = registry.defaultModelId;
  await persist({ model: registry.defaultModelId });
}

export async function restoreDefaultModels(): Promise<void> {
  const registry = await restoreDefaultModelsRequest();
  applyModelRegistry(registry);
  model = registry.defaultModelId;
  await persist({ model: registry.defaultModelId });
}

export function resetSettingsStore(): void {
  apiKeyConfigured = false;
  sizePreset = '16:9';
  imageCount = 4;
  model = DEFAULT_MODEL;
  availableModels = BUILTIN_IMAGE_MODELS.map((entry) => ({
    id: entry.id,
    label: entry.label,
    source: 'builtin' as const,
  }));
  defaultModelId = DEFAULT_MODEL;
  ready = false;
  loading = false;
  loadError = null;
}

export const settingsState = {
  get apiKeyConfigured() {
    return apiKeyConfigured;
  },
  get sizePreset() {
    return sizePreset;
  },
  get imageCount() {
    return imageCount;
  },
  get model() {
    return model;
  },
  get availableModels() {
    return availableModels;
  },
  get defaultModelId() {
    return defaultModelId;
  },
  get ready() {
    return ready;
  },
  get loading() {
    return loading;
  },
  get loadError() {
    return loadError;
  },
};
