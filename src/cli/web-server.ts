import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeReferenceImages, generateImages } from '../lib/api/openrouter';
import type { CliConfig } from './types';
import { publicConfig, readConfig, updateConfig } from './config';
import {
  addModelToRegistry,
  getDefaultModelId,
  getModelConfig,
  listModelRegistry,
  removeModelFromRegistry,
  restoreDefaultModels,
  setDefaultModel,
  toPublicModelConfig,
  toPublicModelRegistry,
  updateModelInRegistry,
} from './model-registry';
import {
  addReferenceUploads,
  createProject,
  createRun,
  deleteProject,
  deleteSession,
  getCurrentProjectId,
  getProjectReferenceDataUrlsByTarget,
  getProjectStatus,
  getRun,
  getSession,
  listProjects,
  listReferences,
  listRuns,
  listSessions,
  removeReference,
  resolveProjectId,
  setCurrentProject,
  showProject,
  updateProjectDetails,
  updateProjectGuides,
  updateReferenceRole,
} from './project-store';
import { CliError } from './errors';
import { readFileAsDataUrl } from './io';
import type { DeriveTarget, ReferenceRole } from './project-store';

interface StartWebServerOptions {
  port?: number;
}

interface JsonRequest<T = unknown> {
  body: T;
}

interface ApiResponse {
  status: number;
  payload: unknown;
}

function projectSummaryWithCurrent() {
  return {
    currentProjectId: getCurrentProjectId(),
    projects: listProjects(),
  };
}

function requireApiKey(config: CliConfig): string {
  if (!config.apiKey.trim()) {
    throw new CliError('AUTH_REQUIRED', 'API key is not configured', [
      'Set the API key in the web app or via: image-sprout config set apiKey <key>',
    ]);
  }
  return config.apiKey.trim();
}

function parseRole(input: unknown): ReferenceRole {
  if (input === 'style' || input === 'subject' || input === 'both') {
    return input;
  }
  return 'both';
}

function parseTarget(input: unknown): DeriveTarget {
  if (input === 'style' || input === 'subject' || input === 'both') {
    return input;
  }
  return 'both';
}

function assertProjectReadyForGenerate(projectId: string): void {
  const status = getProjectStatus(projectId);
  if (status.readiness.generate) {
    return;
  }
  if (status.mode === 'none') {
    throw new CliError('PROJECT_NOT_READY', 'Project has no usable references', [
      `Add references in Project Settings before generating`,
    ]);
  }

  const missing: string[] = [];
  if ((status.mode === 'style' || status.mode === 'both') && !status.guides.stylePresent) {
    missing.push('visual style guide');
  }
  if ((status.mode === 'subject' || status.mode === 'both') && !status.guides.subjectPresent) {
    missing.push('subject guide');
  }
  throw new CliError('PROJECT_NOT_READY', `Project is not ready for generation; missing ${missing.join(' and ')}`, [
    'Derive the missing guide from Project Settings before generating',
  ]);
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

export function toApiErrorResponse(error: unknown): ApiResponse {
  if (error instanceof CliError) {
    return {
      status: error.exitCode === 1 ? 404 : 400,
      payload: {
        error: {
          code: error.code,
          message: error.message,
          suggestions: error.suggestions,
        },
      },
    };
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    status: 500,
    payload: {
      error: {
        code: 'INTERNAL_ERROR',
        message,
        suggestions: [],
      },
    },
  };
}

function sendError(res: ServerResponse, error: unknown): void {
  const response = toApiErrorResponse(error);
  sendJson(res, response.status, response.payload);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function browserRefs(projectId: string) {
  return listReferences(projectId).map((ref) => ({
    id: ref.id,
    projectId,
    role: ref.role,
    filename: ref.filename,
    mimeType: ref.mimeType,
    width: ref.width,
    height: ref.height,
    createdAt: ref.createdAt,
    dataUrl: readFileAsDataUrl(ref.path),
  }));
}

function browserRun(projectId: string, runId: string) {
  const run = getRun(projectId, runId);
  let successIndex = 0;
  return {
    id: run.id,
    sessionId: run.sessionId,
    prompt: run.prompt,
    feedback: run.feedback,
    model: run.model,
    sizePreset: run.sizePreset,
    imageCount: run.imageCount,
    createdAt: run.createdAt,
    images: run.images.map((image) => {
      if (image.status === 'error') {
        return { status: 'error' as const, error: image.error };
      }
      const imagePath = run.imagePaths[successIndex];
      successIndex += 1;
      return {
        status: 'success' as const,
        imageDataUrl: readFileAsDataUrl(imagePath),
      };
    }),
  };
}

function browserRuns(projectId: string, sessionId?: string) {
  return listRuns(projectId, sessionId).map((run) => browserRun(projectId, run.id));
}

function browserProject(projectId: string) {
  const project = showProject(projectId);
  return {
    ...project,
    refs: browserRefs(projectId),
  };
}

function appDir(): string {
  const built = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app');
  return built;
}

function contentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

function serveStatic(res: ServerResponse, requestPath: string): void {
  const root = appDir();
  const indexPath = path.join(root, 'index.html');
  if (!existsSync(indexPath)) {
    throw new CliError('NOT_FOUND', 'Web app assets are missing', [
      'Run: npm run build',
    ]);
  }

  const sanitized = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.normalize(path.join(root, sanitized));
  if (!filePath.startsWith(root)) {
    throw new CliError('INVALID_ARGS', 'Invalid path');
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(readFileSync(filePath));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(readFileSync(indexPath));
}

export async function routeApiRequest(method: string, urlInput: string, body: unknown = {}): Promise<ApiResponse> {
  const url = new URL(urlInput, 'http://127.0.0.1');
  const segments = url.pathname.split('/').filter(Boolean);

  if (method === 'GET' && url.pathname === '/api/bootstrap') {
    const config = readConfig();
    const currentProjectId = getCurrentProjectId();
    return {
      status: 200,
      payload: {
        config: publicConfig(config),
        modelRegistry: toPublicModelRegistry({
          defaultModelId: getDefaultModelId(),
          models: listModelRegistry(),
        }),
        ...projectSummaryWithCurrent(),
        activeProject: currentProjectId ? browserProject(currentProjectId) : null,
      },
    };
  }

  if (method === 'GET' && url.pathname === '/api/config') {
    return { status: 200, payload: publicConfig(readConfig()) };
  }

  if (method === 'PATCH' && url.pathname === '/api/config') {
    return { status: 200, payload: publicConfig(updateConfig(body as Partial<CliConfig>)) };
  }

  if (method === 'GET' && url.pathname === '/api/models') {
    return {
      status: 200,
      payload: toPublicModelRegistry({
        defaultModelId: getDefaultModelId(),
        models: listModelRegistry(),
      }),
    };
  }

  if (method === 'POST' && url.pathname === '/api/models') {
    const requestBody = body as { id?: string; label?: string };
    const model = await addModelToRegistry({
      id: requestBody.id ?? '',
      label: requestBody.label,
      apiKey: readConfig().apiKey,
    });
    return { status: 200, payload: toPublicModelConfig(model) };
  }

  if (method === 'POST' && url.pathname === '/api/models/restore-defaults') {
    return { status: 200, payload: toPublicModelRegistry(restoreDefaultModels()) };
  }

  if (segments[0] === 'api' && segments[1] === 'models' && segments[2]) {
    const modelId = decodeURIComponent(segments[2]);

    if (method === 'PATCH' && segments.length === 3) {
      const requestBody = body as { label?: string };
      return {
        status: 200,
        payload: toPublicModelConfig(updateModelInRegistry(modelId, {
          ...(requestBody.label !== undefined ? { label: requestBody.label } : {}),
        })),
      };
    }

    if (method === 'DELETE' && segments.length === 3) {
      return { status: 200, payload: toPublicModelRegistry(removeModelFromRegistry(modelId)) };
    }

    if (method === 'POST' && segments[3] === 'set-default') {
      return { status: 200, payload: toPublicModelRegistry(setDefaultModel(modelId)) };
    }
  }

  if (method === 'GET' && url.pathname === '/api/projects') {
    return { status: 200, payload: projectSummaryWithCurrent() };
  }

  if (method === 'POST' && url.pathname === '/api/projects') {
    const project = createProject((body as { name?: string }).name ?? 'Untitled Project');
    return {
      status: 200,
      payload: {
        project,
        activeProject: browserProject(project.id),
        ...projectSummaryWithCurrent(),
      },
    };
  }

  if (segments[0] === 'api' && segments[1] === 'projects' && segments.length >= 3) {
    const projectId = resolveProjectId(segments[2]);

    if (method === 'GET' && segments.length === 3) {
      return { status: 200, payload: browserProject(projectId) };
    }

    if (method === 'PATCH' && segments.length === 3) {
      const requestBody = body as Partial<{
        name: string;
        subjectGuide: string;
        visualStyle: string;
        instructions: string;
        coreInstruction: string;
        styleDescription: string;
      }>;
      updateProjectDetails(projectId, {
        ...(requestBody.name !== undefined ? { name: requestBody.name } : {}),
        ...(requestBody.subjectGuide !== undefined
          ? { subjectGuide: requestBody.subjectGuide }
          : requestBody.coreInstruction !== undefined
            ? { subjectGuide: requestBody.coreInstruction }
            : {}),
        ...(requestBody.visualStyle !== undefined
          ? { visualStyle: requestBody.visualStyle }
          : requestBody.styleDescription !== undefined
            ? { visualStyle: requestBody.styleDescription }
            : {}),
        ...(requestBody.instructions !== undefined ? { instructions: requestBody.instructions } : {}),
      });
      return { status: 200, payload: browserProject(projectId) };
    }

    if (method === 'DELETE' && segments.length === 3) {
      deleteProject(projectId);
      return { status: 200, payload: projectSummaryWithCurrent() };
    }

    if (method === 'POST' && segments[3] === 'use') {
      setCurrentProject(projectId);
      return {
        status: 200,
        payload: {
          ...projectSummaryWithCurrent(),
          activeProject: browserProject(projectId),
        },
      };
    }

    if (method === 'GET' && segments[3] === 'refs' && segments.length === 4) {
      return { status: 200, payload: browserRefs(projectId) };
    }

    if (method === 'POST' && segments[3] === 'refs' && segments.length === 4) {
      const requestBody = body as JsonRequest<{
        files?: Array<{ filename: string; dataUrl: string; mimeType?: string; width?: number; height?: number }>;
        role?: ReferenceRole;
      }>;
      const refs = addReferenceUploads(projectId, requestBody.body?.files ?? [], parseRole(requestBody.body?.role));
      return {
        status: 200,
        payload: refs.map((ref) => ({
          id: ref.id,
          projectId,
          role: ref.role,
          filename: ref.filename,
          mimeType: ref.mimeType,
          width: ref.width,
          height: ref.height,
          createdAt: ref.createdAt,
          dataUrl: readFileAsDataUrl(ref.path),
        })),
      };
    }

    if (method === 'PATCH' && segments[3] === 'refs' && segments[4]) {
      const ref = updateReferenceRole(projectId, segments[4], parseRole((body as { role?: ReferenceRole }).role));
      return {
        status: 200,
        payload: {
          id: ref.id,
          projectId,
          role: ref.role,
          filename: ref.filename,
          mimeType: ref.mimeType,
          width: ref.width,
          height: ref.height,
          createdAt: ref.createdAt,
          dataUrl: readFileAsDataUrl(ref.path),
        },
      };
    }

    if (method === 'DELETE' && segments[3] === 'refs' && segments[4]) {
      const refId = segments[4];
      removeReference(projectId, refId);
      return { status: 200, payload: { ok: true } };
    }

    if (method === 'GET' && segments[3] === 'status' && segments.length === 4) {
      return { status: 200, payload: getProjectStatus(projectId) };
    }

    if (method === 'POST' && (segments[3] === 'derive' || segments[3] === 'analyze')) {
      const config = readConfig();
      const apiKey = requireApiKey(config);
      const requestBody = body as { target?: DeriveTarget; persist?: boolean };
      const target = parseTarget(requestBody.target);
      const persist = requestBody.persist !== false;

      const styleRefs = target === 'subject' ? [] : getProjectReferenceDataUrlsByTarget(projectId, 'style');
      const subjectRefs = target === 'style' ? [] : getProjectReferenceDataUrlsByTarget(projectId, 'subject');

      if (target === 'both' && (styleRefs.length === 0 || subjectRefs.length === 0)) {
        throw new CliError('INVALID_ARGS', 'Deriving both guides requires both style and subject references');
      }
      if (target === 'style' && styleRefs.length === 0) {
        throw new CliError('INVALID_ARGS', 'No style references found for this project');
      }
      if (target === 'subject' && subjectRefs.length === 0) {
        throw new CliError('INVALID_ARGS', 'No subject references found for this project');
      }

      let visualStyle: string | undefined;
      let subjectGuide: string | undefined;

      if (target === 'both' && JSON.stringify(styleRefs) === JSON.stringify(subjectRefs)) {
        const result = await analyzeReferenceImages(styleRefs, apiKey);
        visualStyle = result.visualStyle;
        subjectGuide = result.subjectGuide;
      } else {
        if (target === 'style' || target === 'both') {
          const result = await analyzeReferenceImages(styleRefs, apiKey);
          visualStyle = result.visualStyle;
        }
        if (target === 'subject' || target === 'both') {
          const result = await analyzeReferenceImages(subjectRefs, apiKey);
          subjectGuide = result.subjectGuide;
        }
      }

      if (persist) {
        updateProjectGuides(projectId, {
          ...(visualStyle !== undefined ? { visualStyle } : {}),
          ...(subjectGuide !== undefined ? { subjectGuide } : {}),
        });
      }

      const status = persist
        ? getProjectStatus(projectId)
        : getProjectStatus(projectId);
      const project = showProject(projectId);
      return {
        status: 200,
        payload: {
          visualStyle: visualStyle ?? project.visualStyle,
          subjectGuide: subjectGuide ?? project.subjectGuide,
          target,
          mode: status.mode,
          readiness: status.readiness,
          project: browserProject(projectId),
        },
      };
    }

    if (method === 'POST' && segments[3] === 'generate') {
      const generateBody = body as Record<string, unknown>;
      const config = readConfig();
      const apiKey = requireApiKey(config);
      const project = showProject(projectId);
      assertProjectReadyForGenerate(projectId);
      const prompt = String(generateBody.prompt ?? '').trim();
      if (!prompt) {
        throw new CliError('INVALID_ARGS', 'Prompt is required');
      }
      const selectedImageDataUrls = Array.isArray(generateBody.selectedImageDataUrls)
        ? generateBody.selectedImageDataUrls.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [];
      const styleReferenceDataUrls = getProjectReferenceDataUrlsByTarget(projectId, 'style')
        .filter((value, index, array) => array.indexOf(value) === index);
      const sessionId = typeof generateBody.sessionId === 'string' ? generateBody.sessionId : undefined;
      // First run uses the project style refs.
      // Later iteration uses selected run images when provided; otherwise it falls back to the project refs.
      const referenceImageDataUrls = selectedImageDataUrls.length > 0
        ? Array.from(new Set(selectedImageDataUrls))
        : styleReferenceDataUrls;
      const results = await generateImages(
        {
          referenceImageDataUrls,
          visualStyle: project.visualStyle,
          subjectGuide: project.subjectGuide,
          instructions: project.instructions,
          prompt,
          feedback: typeof generateBody.feedback === 'string' ? generateBody.feedback : null,
          sizePreset: (generateBody.sizePreset as CliConfig['sizePreset'] | undefined) ?? config.sizePreset,
          imageCount: typeof generateBody.imageCount === 'number' ? generateBody.imageCount : config.imageCount,
          model: (generateBody.model as CliConfig['model'] | undefined) ?? config.model,
          requestFormat: getModelConfig((generateBody.model as CliConfig['model'] | undefined) ?? config.model).requestFormat,
        },
        apiKey
      );
      const stored = await createRun({
        project: projectId,
        prompt,
        feedback: typeof generateBody.feedback === 'string' ? generateBody.feedback : null,
        model: (generateBody.model as CliConfig['model'] | undefined) ?? config.model,
        sizePreset: (generateBody.sizePreset as CliConfig['sizePreset'] | undefined) ?? config.sizePreset,
        imageCount: typeof generateBody.imageCount === 'number' ? generateBody.imageCount : config.imageCount,
        sessionId,
        imagePayloads: results.map((result) =>
          result.status === 'success'
            ? { status: 'success' as const, imageData: result.imageDataUrl }
            : { status: 'error' as const, error: result.error ?? 'Unknown error' }
        ),
      });
      return {
        status: 200,
        payload: {
        sessionId: stored.session.id,
        run: browserRun(projectId, stored.run.id),
        runs: browserRuns(projectId, stored.session.id),
        },
      };
    }

    if (method === 'GET' && segments[3] === 'sessions' && segments.length === 4) {
      return { status: 200, payload: listSessions(projectId) };
    }

    if (method === 'GET' && segments[3] === 'sessions' && segments[4]) {
      const sessionId = segments[4];
      return {
        status: 200,
        payload: {
        session: getSession(projectId, sessionId),
        runs: browserRuns(projectId, sessionId),
        },
      };
    }

    if (method === 'DELETE' && segments[3] === 'sessions' && segments[4]) {
      deleteSession(projectId, segments[4]);
      return { status: 200, payload: { ok: true } };
    }

    if (method === 'GET' && segments[3] === 'runs' && segments.length === 4) {
      const sessionId = url.searchParams.get('sessionId') ?? undefined;
      return { status: 200, payload: browserRuns(projectId, sessionId) };
    }

    if (method === 'GET' && segments[3] === 'runs' && segments[4]) {
      return { status: 200, payload: browserRun(projectId, segments[4]) };
    }
  }

  throw new CliError('NOT_FOUND', `Unknown route: ${method} ${url.pathname}`);
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const body = ['GET', 'HEAD'].includes(req.method ?? 'GET') ? {} : await readJson(req);
  const response = await routeApiRequest(req.method ?? 'GET', url.toString(), body);
  sendJson(res, response.status, response.payload);
}

export async function startWebServer(options: StartWebServerOptions = {}): Promise<{ port: number; url: string; close: () => Promise<void> }> {
  const port = options.port ?? 4310;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `127.0.0.1:${port}`}`);
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
        return;
      }
      serveStatic(res, url.pathname);
    } catch (error) {
      sendError(res, error);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : port;
  const resolvedUrl = `http://127.0.0.1:${resolvedPort}`;
  process.on('SIGINT', () => server.close());
  process.on('SIGTERM', () => server.close());
  return {
    port: resolvedPort,
    url: resolvedUrl,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
