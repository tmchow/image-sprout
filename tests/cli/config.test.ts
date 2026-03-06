// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { configGet, configSet, configShow, configUnset, getConfigPath } from '../../src/cli/config';

describe('cli config', () => {
  let appHome = '';
  let priorHome: string | undefined;

  beforeEach(() => {
    priorHome = process.env.IMAGE_SPROUT_HOME;
    appHome = mkdtempSync(path.join(tmpdir(), 'image-sprout-cli-test-'));
    process.env.IMAGE_SPROUT_HOME = appHome;
  });

  afterEach(() => {
    if (priorHome === undefined) {
      delete process.env.IMAGE_SPROUT_HOME;
    } else {
      process.env.IMAGE_SPROUT_HOME = priorHome;
    }

    if (appHome) {
      rmSync(appHome, { recursive: true, force: true });
    }
  });

  it('sets and gets a model', () => {
    configSet('model', 'openai/gpt-5-image');
    const value = configGet('model');
    expect(value.key).toBe('model');
    expect(value.value).toBe('openai/gpt-5-image');
  });

  it('masks api key in public config output', () => {
    configSet('apiKey', 'secret-key');

    expect(configShow().apiKeyConfigured).toBe(true);
    expect(configGet('apiKey')).toEqual({ key: 'apiKey', configured: true });
  });

  it('unsets to defaults', () => {
    configSet('imageCount', '2');
    const afterUnset = configUnset('imageCount');
    expect(afterUnset.imageCount).toBe(4);
  });

  it('exposes config path and defaults', () => {
    const data = configShow();
    expect(getConfigPath()).toContain(appHome);
    expect(data.sizePreset).toBe('16:9');
    expect(data.model.length).toBeGreaterThan(0);
    expect(data.apiKeyConfigured).toBe(false);
  });
});
