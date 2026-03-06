import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { CliError } from './errors';

function appHome(): string {
  if (process.env.IMAGE_SPROUT_HOME) {
    return process.env.IMAGE_SPROUT_HOME;
  }

  // Backward-compatible override for the earlier CLI config location.
  if (process.env.IMAGE_SPROUT_CONFIG_DIR) {
    return process.env.IMAGE_SPROUT_CONFIG_DIR;
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new CliError('CONFIG_ERROR', 'APPDATA is not set', [
        'Set IMAGE_SPROUT_HOME explicitly',
      ]);
    }
    return path.join(appData, 'image-sprout');
  }

  if (process.platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Application Support', 'image-sprout');
  }

  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) {
    return path.join(xdg, 'image-sprout');
  }

  return path.join(homedir(), '.local', 'share', 'image-sprout');
}

export function getAppHome(): string {
  return appHome();
}

export function ensureAppHome(): string {
  const home = appHome();
  mkdirSync(home, { recursive: true });
  return home;
}

export function getConfigPath(): string {
  return path.join(appHome(), 'config.json');
}

export function getModelsPath(): string {
  return path.join(appHome(), 'models.json');
}

export function getStatePath(): string {
  return path.join(appHome(), 'state.json');
}

export function getProjectsPath(): string {
  return path.join(appHome(), 'projects');
}

export function ensureProjectsPath(): string {
  const target = getProjectsPath();
  mkdirSync(target, { recursive: true });
  return target;
}
