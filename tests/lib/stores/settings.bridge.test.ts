import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/api/local-bridge', () => ({
  getBootstrap: vi.fn(async () => ({
    config: {
      apiKeyConfigured: true,
      model: 'google/gemini-3.1-flash-image-preview',
      sizePreset: '16:9',
      imageCount: 4,
    },
    modelRegistry: {
      defaultModelId: 'google/gemini-3.1-flash-image-preview',
      models: [
        {
          id: 'google/gemini-3.1-flash-image-preview',
          label: 'Nano Banana 2',
          requestFormat: 'image-config',
          source: 'builtin',
        },
      ],
    },
    currentProjectId: null,
    projects: [],
    activeProject: null,
  })),
  updateConfig: vi.fn(async (changes: Record<string, unknown>) => ({
    apiKeyConfigured: typeof changes.apiKey === 'string' ? changes.apiKey.trim().length > 0 : true,
    model: (changes.model ?? 'google/gemini-3.1-flash-image-preview') as string,
    sizePreset: (changes.sizePreset ?? '16:9') as string,
    imageCount: Number(changes.imageCount ?? 4),
  })),
}));

import { loadSettings, resetSettingsStore, setApiKey, settingsState } from '../../../src/lib/stores/settings.svelte';

describe('settings store bridge', () => {
  beforeEach(() => {
    resetSettingsStore();
    vi.clearAllMocks();
  });

  it('loads config from bootstrap', async () => {
    await loadSettings();
    expect(settingsState.ready).toBe(true);
    expect(settingsState.apiKeyConfigured).toBe(true);
    expect(settingsState.imageCount).toBe(4);
  });

  it('persists API key changes through the bridge', async () => {
    await loadSettings();
    await setApiKey('sk-new');
    expect(settingsState.apiKeyConfigured).toBe(true);
  });
});
