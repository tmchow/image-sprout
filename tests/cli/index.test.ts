// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as openrouter from '../../src/lib/api/openrouter';
import { configSet } from '../../src/cli/config';
import { handleCliError, runCli } from '../../src/cli/index';
import { createProject, createRun, updateProjectAnalysis } from '../../src/cli/project-store';

const ONE_BY_ONE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8Kx4AAAAASUVORK5CYII=';

async function invoke(argv: string[]): Promise<{ exitCode: number; stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
    stdout.push(String(value ?? ''));
  });
  const error = vi.spyOn(console, 'error').mockImplementation((value?: unknown) => {
    stderr.push(String(value ?? ''));
  });

  try {
    const exitCode = await runCli(argv);
    return { exitCode, stdout, stderr };
  } catch (thrown) {
    const exitCode = handleCliError(thrown, argv);
    return { exitCode, stdout, stderr };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

function parsePayload(lines: string[]): unknown {
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]);
}

describe('cli commands', () => {
  let appHome = '';
  let priorHome: string | undefined;
  let fixturePath = '';
  let alternateFixturePath = '';

  beforeEach(() => {
    priorHome = process.env.IMAGE_SPROUT_HOME;
    appHome = mkdtempSync(path.join(tmpdir(), 'image-sprout-cli-'));
    process.env.IMAGE_SPROUT_HOME = appHome;
    fixturePath = path.join(appHome, 'fixture.png');
    alternateFixturePath = path.join(appHome, 'fixture-2.png');
    writeFileSync(fixturePath, Buffer.from(ONE_BY_ONE_PNG, 'base64'));
    writeFileSync(alternateFixturePath, Buffer.from('not-the-same-image'));
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

  it('supports project selectors and list limits', async () => {
    createProject('Alpha');
    createProject('Beta');

    const idsResult = await invoke(['project', 'list', '--ids', '--json']);
    const idsPayload = parsePayload(idsResult.stdout) as { data: string[] };

    expect(idsResult.exitCode).toBe(0);
    expect(idsPayload.data).toEqual(['alpha', 'beta']);

    const currentResult = await invoke(['project', 'current', '--value', 'id', '--json']);
    const currentPayload = parsePayload(currentResult.stdout) as { data: string };

    expect(currentPayload.data).toBe('beta');

    const limitedResult = await invoke(['project', 'list', '--limit', '1', '--json']);
    const limitedPayload = parsePayload(limitedResult.stdout) as {
      data: { projects: Array<{ id: string }> };
    };

    expect(limitedPayload.data.projects).toHaveLength(1);
    expect(limitedPayload.data.projects[0].id).toBe('alpha');
  });

  it('renders help as plain text by default', async () => {
    const result = await invoke(['help']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toEqual([]);
    expect(result.stdout).toHaveLength(1);
    expect(result.stdout[0]).toContain('image-sprout <command> [options]');
    expect(result.stdout[0]).toContain('project    Manage projects and generation workflow');
    expect(() => JSON.parse(result.stdout[0])).toThrow();
  });

  it('renders help as json when explicitly requested', async () => {
    const result = await invoke(['help', '--json']);
    const payload = parsePayload(result.stdout) as { data: { text: string } };

    expect(result.exitCode).toBe(0);
    expect(payload.data.text).toContain('image-sprout <command> [options]');
  });

  it('renders subcommand help as plain text by default', async () => {
    const result = await invoke(['project', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toEqual([]);
    expect(result.stdout).toHaveLength(1);
    expect(result.stdout[0]).toContain('image-sprout project <subcommand> [options]');
    expect(result.stdout[0]).toContain('update     Update project details, guides, or instructions');
    expect(() => JSON.parse(result.stdout[0])).toThrow();
  });

  it('updates project metadata and exposes session and run lookups', async () => {
    const project = createProject('Forest Story');
    const stored = await createRun({
      project: project.id,
      prompt: 'fox reading under a pine tree',
      feedback: null,
      sizePreset: '16:9',
      imageCount: 1,
      imagePayloads: [{ status: 'success', imageData: `data:image/png;base64,${ONE_BY_ONE_PNG}` }],
    });

    const updateResult = await invoke([
      'project',
      'update',
      project.id,
      '--name',
      'Story Bible',
      '--subject',
      'fox protagonist with bright scarf',
      '--style',
      'painterly soft greens',
      '--instructions',
      'Keep a subtle trevinsays.com watermark in the lower-right corner.',
      '--json',
    ]);
    const updatePayload = parsePayload(updateResult.stdout) as {
      data: { id: string; name: string; subjectGuide: string; visualStyle: string; instructions: string };
    };

    expect(updateResult.exitCode).toBe(0);
    expect(updatePayload.data.name).toBe('Story Bible');
    expect(updatePayload.data.subjectGuide).toBe('fox protagonist with bright scarf');
    expect(updatePayload.data.visualStyle).toBe('painterly soft greens');
    expect(updatePayload.data.instructions).toContain('trevinsays.com');

    const sessionResult = await invoke([
      'session',
      'show',
      stored.session.id,
      '--project',
      project.id,
      '--value',
      'session.id',
      '--json',
    ]);
    const sessionPayload = parsePayload(sessionResult.stdout) as { data: string };

    expect(sessionPayload.data).toBe(stored.session.id);

    const runResult = await invoke(['run', 'latest', '--project', project.id, '--value', 'run.id', '--json']);
    const runPayload = parsePayload(runResult.stdout) as { data: string };

    expect(runPayload.data).toBe(stored.run.id);
  });

  it('supports role-aware refs and project status', async () => {
    const project = createProject('Comic Hero');

    const addResult = await invoke(['ref', 'add', '--project', project.id, '--role', 'style', fixturePath, '--json']);
    const addPayload = parsePayload(addResult.stdout) as { data: { refs: Array<{ id: string; role: string }> } };
    expect(addPayload.data.refs[0].role).toBe('style');

    const updateResult = await invoke(['ref', 'update', '--project', project.id, '--role', 'both', addPayload.data.refs[0].id, '--json']);
    const updatePayload = parsePayload(updateResult.stdout) as { data: { ref: { role: string } } };
    expect(updatePayload.data.ref.role).toBe('both');

    const statusResult = await invoke(['project', 'status', project.id, '--json']);
    const statusPayload = parsePayload(statusResult.stdout) as {
      data: {
        mode: string;
        refs: { both: number; effectiveStyle: number; effectiveSubject: number };
        readiness: { generate: boolean };
        config: { apiKeyConfigured: boolean };
      };
    };

    expect(statusPayload.data.mode).toBe('both');
    expect(statusPayload.data.refs.both).toBe(1);
    expect(statusPayload.data.refs.effectiveStyle).toBe(1);
    expect(statusPayload.data.refs.effectiveSubject).toBe(1);
    expect(statusPayload.data.readiness.generate).toBe(false);
    expect(statusPayload.data.config.apiKeyConfigured).toBe(false);
  });

  it('masks api key output and blocks generation when project is not ready', async () => {
    configSet('apiKey', 'secret-key');
    const project = createProject('Editorial Style');
    await invoke(['ref', 'add', '--project', project.id, '--role', 'style', fixturePath]);

    const configResult = await invoke(['config', 'show', '--json']);
    const configPayload = parsePayload(configResult.stdout) as {
      data: { config: { apiKeyConfigured: boolean; model: string } };
    };
    expect(configPayload.data.config.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(configPayload)).not.toContain('secret-key');

    const getResult = await invoke(['config', 'get', 'apiKey', '--json']);
    const getPayload = parsePayload(getResult.stdout) as {
      data: { key: string; configured: boolean };
    };
    expect(getPayload.data).toEqual({ key: 'apiKey', configured: true });

    const generateResult = await invoke(['project', 'generate', project.id, '--prompt', 'fox in the snow', '--json']);
    const generatePayload = parsePayload(generateResult.stderr) as { error: { code: string; message: string } };

    expect(generateResult.exitCode).toBeGreaterThan(0);
    expect(generatePayload.error.code).toBe('PROJECT_NOT_READY');
    expect(generatePayload.error.message).toContain('visual style guide');
  });

  it('derives targeted guides from role-specific refs', async () => {
    const analysisSpy = vi
      .spyOn(openrouter, 'analyzeReferenceImages')
      .mockResolvedValueOnce({ visualStyle: 'inked graphic panels', subjectGuide: 'ignored subject' })
      .mockResolvedValueOnce({ visualStyle: 'ignored style', subjectGuide: 'masked hero with red scarf' });
    try {
      configSet('apiKey', 'secret-key');
      const project = createProject('Split Refs');
      await invoke(['ref', 'add', '--project', project.id, '--role', 'style', fixturePath]);
      await invoke(['ref', 'add', '--project', project.id, '--role', 'subject', alternateFixturePath]);

      const deriveResult = await invoke(['project', 'derive', project.id, '--target', 'both', '--json']);
      const derivePayload = parsePayload(deriveResult.stdout) as {
        data: { visualStyle: string; subjectGuide: string; readiness: { style: boolean; subject: boolean } };
      };

      expect(deriveResult.exitCode).toBe(0);
      expect(analysisSpy).toHaveBeenCalledTimes(2);
      expect(derivePayload.data.visualStyle).toBe('inked graphic panels');
      expect(derivePayload.data.subjectGuide).toBe('masked hero with red scarf');
      expect(derivePayload.data.readiness.style).toBe(true);
      expect(derivePayload.data.readiness.subject).toBe(true);
    } finally {
      analysisSpy.mockRestore();
    }
  });

  it('uses only style-effective refs when generating from split refs', async () => {
    const generateSpy = vi.spyOn(openrouter, 'generateImages').mockResolvedValue([
      { status: 'success', imageDataUrl: `data:image/png;base64,${ONE_BY_ONE_PNG}`, selected: false },
    ]);

    try {
      configSet('apiKey', 'secret-key');
      const project = createProject('Split Generate');
      await invoke(['ref', 'add', '--project', project.id, '--role', 'style', fixturePath]);
      await invoke(['ref', 'add', '--project', project.id, '--role', 'subject', alternateFixturePath]);
      updateProjectAnalysis(project.id, {
        visualStyle: 'Painterly visual style',
        subjectGuide: 'Seed mascot subject',
      });
      await invoke([
        'project',
        'update',
        project.id,
        '--instructions',
        'Bottom right corner should say trevinsays.com in a subtle watermark.',
      ]);

      const result = await invoke(['project', 'generate', project.id, '--prompt', 'seed mascot in a forest', '--json']);

      expect(result.exitCode).toBe(0);
      expect(generateSpy).toHaveBeenCalledTimes(1);
      expect(generateSpy.mock.calls[0][0].referenceImageDataUrls).toHaveLength(1);
      expect(generateSpy.mock.calls[0][0].visualStyle).toBe('Painterly visual style');
      expect(generateSpy.mock.calls[0][0].subjectGuide).toBe('Seed mascot subject');
      expect(generateSpy.mock.calls[0][0].instructions).toContain('trevinsays.com');
    } finally {
      generateSpy.mockRestore();
    }
  });

  it('rejects adding models that are not valid text+image input and image output models', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'foo/text-only',
              name: 'Foo Text Only',
              architecture: {
                input_modalities: ['text'],
                output_modalities: ['text'],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    configSet('apiKey', 'secret-key');
    const result = await invoke(['model', 'add', 'foo/text-only', '--json']);
    const payload = parsePayload(result.stderr) as { error: { code: string; message: string } };

    expect(result.exitCode).toBeGreaterThan(0);
    expect(payload.error.code).toBe('INVALID_ARGS');
    expect(payload.error.message).toContain('does not accept image input');
  });

  it('renders selector and validation errors as structured json', async () => {
    createProject('Alpha');

    const valueError = await invoke(['project', 'current', '--value', 'missing.path', '--json']);
    const valuePayload = parsePayload(valueError.stderr) as { error: { code: string; message: string } };

    expect(valueError.exitCode).toBeGreaterThan(0);
    expect(valuePayload.error.code).toBe('NOT_FOUND');
    expect(valuePayload.error.message).toContain('Value path not found: missing.path');

    const limitError = await invoke(['project', 'list', '--limit', '0', '--json']);
    const limitPayload = parsePayload(limitError.stderr) as { error: { code: string; message: string } };

    expect(limitError.exitCode).toBeGreaterThan(0);
    expect(limitPayload.error.code).toBe('INVALID_ARGS');
    expect(limitPayload.error.message).toContain('Invalid value for --limit: 0');
  });
});
