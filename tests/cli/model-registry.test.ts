// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addModelToRegistry,
  getDefaultModelId,
  listModelRegistry,
  restoreDefaultModels,
  setDefaultModel,
} from '../../src/cli/model-registry';

describe('model registry', () => {
  let appHome = '';
  let priorHome: string | undefined;

  beforeEach(() => {
    priorHome = process.env.IMAGE_SPROUT_HOME;
    appHome = mkdtempSync(path.join(tmpdir(), 'image-sprout-model-registry-'));
    process.env.IMAGE_SPROUT_HOME = appHome;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (priorHome === undefined) {
      delete process.env.IMAGE_SPROUT_HOME;
    } else {
      process.env.IMAGE_SPROUT_HOME = priorHome;
    }

    if (appHome) {
      rmSync(appHome, { recursive: true, force: true });
    }
  });

  it('starts with builtin defaults and can restore them', () => {
    const initial = listModelRegistry();
    expect(initial).toHaveLength(3);
    expect(getDefaultModelId()).toBe(initial[0].id);

    setDefaultModel('openai/gpt-5-image');
    expect(getDefaultModelId()).toBe('openai/gpt-5-image');

    const restored = restoreDefaultModels();
    expect(restored.defaultModelId).toBe(initial[0].id);
    expect(restored.models).toHaveLength(3);
  });

  it('adds a user model and defaults label from OpenRouter metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'foo/bar-image',
              name: 'Foo Bar Image',
              architecture: {
                input_modalities: ['text', 'image'],
                output_modalities: ['image'],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const added = await addModelToRegistry({ id: 'foo/bar-image' });

    expect(added.label).toBe('Foo Bar Image');
    expect(added.source).toBe('user');
    expect(listModelRegistry().some((model) => model.id === 'foo/bar-image')).toBe(true);
  });

  it('rejects models that do not accept image input', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'foo/text-to-image',
              name: 'Foo Text To Image',
              architecture: {
                input_modalities: ['text'],
                output_modalities: ['image'],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await expect(addModelToRegistry({ id: 'foo/text-to-image' })).rejects.toThrow(
      'Model does not accept image input'
    );
  });

  it('rejects models that do not accept text input', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'foo/image-to-image',
              name: 'Foo Image To Image',
              architecture: {
                input_modalities: ['image'],
                output_modalities: ['image'],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await expect(addModelToRegistry({ id: 'foo/image-to-image' })).rejects.toThrow(
      'Model does not accept text input'
    );
  });

  it('rejects models that do not generate images', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'foo/image-reader',
              name: 'Foo Image Reader',
              architecture: {
                input_modalities: ['text', 'image'],
                output_modalities: ['text'],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await expect(addModelToRegistry({ id: 'foo/image-reader' })).rejects.toThrow(
      'Model does not generate images'
    );
  });
});
