// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { routeApiRequest, toApiErrorResponse } from '../../src/cli/web-server';
import * as openrouter from '../../src/lib/api/openrouter';

const STYLE_DATA_URL = 'data:image/png;base64,c3R5bGU=';
const SUBJECT_DATA_URL = 'data:image/png;base64,c3ViamVjdA==';

describe('web server bridge routing', () => {
  let appHome = '';
  let priorHome: string | undefined;

  beforeEach(() => {
    priorHome = process.env.IMAGE_SPROUT_HOME;
    appHome = mkdtempSync(path.join(tmpdir(), 'image-sprout-web-server-'));
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

  it('serves bootstrap state and allows config/project updates', async () => {
    const bootstrap = await routeApiRequest('GET', '/api/bootstrap');
    expect((bootstrap.payload as any).projects).toEqual([]);
    expect((bootstrap.payload as any).currentProjectId).toBeNull();

    const updatedConfig = await routeApiRequest('PATCH', '/api/config', {
      apiKey: 'sk-test',
      imageCount: 2,
    });
    expect((updatedConfig.payload as any).apiKeyConfigured).toBe(true);
    expect((updatedConfig.payload as any).imageCount).toBe(2);

    const created = await routeApiRequest('POST', '/api/projects', { name: 'Bridge Project' });
    expect((created.payload as any).project.id).toBe('bridge-project');
    expect((created.payload as any).currentProjectId).toBe('bridge-project');
    expect((created.payload as any).activeProject.refs).toEqual([]);

    const project = await routeApiRequest('GET', '/api/projects/bridge-project');
    expect((project.payload as any).name).toBe('Bridge Project');
    expect((project.payload as any).refs).toEqual([]);
  });

  it('serializes invalid API errors for the bridge', async () => {
    const errorResponse = toApiErrorResponse(new Error('boom'));
    expect(errorResponse.status).toBe(500);
    expect((errorResponse.payload as any).error.code).toBe('INTERNAL_ERROR');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    try {
      await expect(routeApiRequest('POST', '/api/models', { id: 'asdf' })).rejects.toThrow(
        'Model not found on OpenRouter: asdf'
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('uses only style-effective refs during generation', async () => {
    const createResponse = await routeApiRequest('POST', '/api/projects', { name: 'Bridge Split' });
    const projectId = (createResponse.payload as any).project.id as string;

    await routeApiRequest('PATCH', '/api/config', { apiKey: 'sk-test' });
    await routeApiRequest('POST', `/api/projects/${projectId}/refs`, {
      body: {
        files: [{ filename: 'style.png', dataUrl: STYLE_DATA_URL, mimeType: 'image/png' }],
        role: 'style',
      },
    });
    await routeApiRequest('POST', `/api/projects/${projectId}/refs`, {
      body: {
        files: [{ filename: 'subject.png', dataUrl: SUBJECT_DATA_URL, mimeType: 'image/png' }],
        role: 'subject',
      },
    });
    await routeApiRequest('PATCH', `/api/projects/${projectId}`, {
      visualStyle: 'Painterly visual style',
      subjectGuide: 'Seed mascot subject',
      instructions: 'Bottom right corner should say trevinsays.com in a subtle watermark.',
    });

    const generateSpy = vi.spyOn(openrouter, 'generateImages').mockResolvedValue([
      { status: 'success', imageDataUrl: STYLE_DATA_URL, selected: false },
    ]);

    try {
      const response = await routeApiRequest('POST', `/api/projects/${projectId}/generate`, {
        prompt: 'seed mascot in a forest',
        feedback: null,
        selectedImageDataUrls: [],
      });

      expect(response.status).toBe(200);
      expect(generateSpy).toHaveBeenCalledTimes(1);
      expect(generateSpy.mock.calls[0][0].referenceImageDataUrls).toEqual([STYLE_DATA_URL]);
      expect(generateSpy.mock.calls[0][0].visualStyle).toBe('Painterly visual style');
      expect(generateSpy.mock.calls[0][0].subjectGuide).toBe('Seed mascot subject');
      expect(generateSpy.mock.calls[0][0].instructions).toContain('trevinsays.com');
    } finally {
      generateSpy.mockRestore();
    }
  });


  it('falls back to project style refs for a later iteration when no result images are selected', async () => {
    await routeApiRequest('PATCH', '/api/config', { apiKey: 'secret-key' });
    const projectId = (await routeApiRequest('POST', '/api/projects', { name: 'Fallback Iterate Project' }) as { status: number; payload: { project: { id: string } } }).payload.project.id;
    await routeApiRequest('POST', `/api/projects/${projectId}/refs`, {
      body: {
        files: [{ filename: 'style.png', dataUrl: STYLE_DATA_URL, mimeType: 'image/png' }],
        role: 'style',
      },
    });
    await routeApiRequest('PATCH', `/api/projects/${projectId}`, {
      visualStyle: 'Painterly visual style',
      subjectGuide: 'Seed mascot subject',
      instructions: 'Always include the watermark.',
    });

    const generateSpy = vi.spyOn(openrouter, 'generateImages').mockResolvedValue([
      { status: 'success', imageDataUrl: STYLE_DATA_URL, selected: false },
    ]);

    try {
      const first = await routeApiRequest('POST', `/api/projects/${projectId}/generate`, {
        prompt: 'seed mascot in a forest',
        feedback: null,
        selectedImageDataUrls: [],
      });
      const sessionId = (first.payload as any).sessionId as string;

      const response = await routeApiRequest('POST', `/api/projects/${projectId}/generate`, {
        prompt: 'seed mascot in a forest',
        feedback: 'make it moodier',
        sessionId,
        selectedImageDataUrls: [],
      });

      expect(response.status).toBe(200);
      expect(generateSpy).toHaveBeenCalledTimes(2);
      expect(generateSpy.mock.calls[1][0].referenceImageDataUrls).toEqual([STYLE_DATA_URL]);
      expect(generateSpy.mock.calls[1][0].visualStyle).toBe('Painterly visual style');
      expect(generateSpy.mock.calls[1][0].subjectGuide).toBe('Seed mascot subject');
      expect(generateSpy.mock.calls[1][0].instructions).toBe('Always include the watermark.');
    } finally {
      generateSpy.mockRestore();
    }
  });
});
