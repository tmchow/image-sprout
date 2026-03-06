import type {
  Project,
  ProjectStatus,
  PublicConfig,
  PublicModelRegistry,
  PublicImageModel,
  ReferenceImage,
  ReferenceRole,
  Run,
  Session,
  ImageModel,
  SizePreset,
  DeriveTarget,
} from '../types';

export interface BridgeProjectSummary extends Project {
  referenceCount: number;
  sessionCount: number;
  runCount: number;
  isActive: boolean;
}

export interface BridgeProjectDetails extends BridgeProjectSummary {
  refs: ReferenceImage[];
}

interface BridgeErrorPayload {
  error?: {
    code?: string;
    message?: string;
    suggestions?: string[];
  };
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const target =
    typeof window !== 'undefined'
      ? new URL(input, window.location.origin).toString()
      : input;

  const response = await fetch(target, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    let payload: BridgeErrorPayload = {};
    try {
      payload = (await response.json()) as BridgeErrorPayload;
    } catch {
      // ignore
    }
    throw new Error(payload.error?.message ?? `Request failed: ${response.status}`);
  }

  if (!contentType.includes('application/json')) {
    const body = await response.text();
    const trimmed = body.trimStart();
    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
      throw new Error('Expected JSON from /api but received HTML. Start the app through `npm run web`, or use a dev server with the local bridge middleware enabled.');
    }
    throw new Error(`Expected JSON response but received ${contentType || 'unknown content type'}`);
  }

  return response.json() as Promise<T>;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function getBootstrap(): Promise<{
  config: PublicConfig;
  modelRegistry: PublicModelRegistry;
  currentProjectId: string | null;
  projects: BridgeProjectSummary[];
  activeProject: BridgeProjectDetails | null;
}> {
  return requestJson('/api/bootstrap');
}

export async function updateConfig(
  changes: Partial<{ apiKey: string; model: ImageModel; sizePreset: SizePreset; imageCount: number }>
): Promise<PublicConfig> {
  return requestJson('/api/config', {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}

export async function listModelsRequest(): Promise<PublicModelRegistry> {
  return requestJson('/api/models');
}

export async function addModelRequest(params: {
  id: string;
  label?: string;
}): Promise<PublicImageModel> {
  return requestJson('/api/models', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function updateModelRequest(
  modelId: string,
  changes: Partial<Pick<PublicImageModel, 'label'>>
): Promise<PublicImageModel> {
  return requestJson(`/api/models/${encodeURIComponent(modelId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}

export async function removeModelRequest(modelId: string): Promise<PublicModelRegistry> {
  return requestJson(`/api/models/${encodeURIComponent(modelId)}`, {
    method: 'DELETE',
  });
}

export async function setDefaultModelRequest(modelId: string): Promise<PublicModelRegistry> {
  return requestJson(`/api/models/${encodeURIComponent(modelId)}/set-default`, {
    method: 'POST',
  });
}

export async function restoreDefaultModelsRequest(): Promise<PublicModelRegistry> {
  return requestJson('/api/models/restore-defaults', {
    method: 'POST',
  });
}

export async function createProjectRequest(name: string): Promise<{
  project: BridgeProjectSummary;
  currentProjectId: string | null;
  projects: BridgeProjectSummary[];
  activeProject: BridgeProjectDetails;
}> {
  return requestJson('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function listProjectsRequest(): Promise<{
  currentProjectId: string | null;
  projects: BridgeProjectSummary[];
}> {
  return requestJson('/api/projects');
}

export async function getProjectRequest(projectId: string): Promise<BridgeProjectDetails> {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}`);
}

export async function useProjectRequest(projectId: string): Promise<{
  currentProjectId: string | null;
  projects: BridgeProjectSummary[];
  activeProject: BridgeProjectDetails;
}> {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}/use`, {
    method: 'POST',
  });
}

export async function updateProjectRequest(
  projectId: string,
  changes: Partial<Pick<Project, 'name' | 'subjectGuide' | 'visualStyle' | 'instructions'>>
): Promise<BridgeProjectDetails> {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}

export async function deleteProjectRequest(projectId: string): Promise<{
  currentProjectId: string | null;
  projects: BridgeProjectSummary[];
}> {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
}

export async function addProjectRefs(
  projectId: string,
  files: Array<{ file: File; width?: number; height?: number }>,
  role: ReferenceRole = 'both'
): Promise<ReferenceImage[]> {
  const payload = await Promise.all(
    files.map(async ({ file, width, height }) => ({
      filename: file.name,
      mimeType: file.type,
      width,
      height,
      dataUrl: await fileToDataUrl(file),
    }))
  );

  return requestJson(`/api/projects/${encodeURIComponent(projectId)}/refs`, {
    method: 'POST',
    body: JSON.stringify({ body: { files: payload, role } }),
  });
}

export async function removeProjectRef(projectId: string, refId: string): Promise<void> {
  await requestJson(`/api/projects/${encodeURIComponent(projectId)}/refs/${encodeURIComponent(refId)}`, {
    method: 'DELETE',
  });
}

export async function updateProjectRefRole(
  projectId: string,
  refId: string,
  role: ReferenceRole
): Promise<ReferenceImage> {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}/refs/${encodeURIComponent(refId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function getProjectStatusRequest(projectId: string): Promise<ProjectStatus> {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}/status`);
}

export async function deriveProjectRequest(
  projectId: string,
  target: DeriveTarget = 'both',
  options?: { persist?: boolean }
): Promise<{
  visualStyle: string;
  subjectGuide: string;
  target: DeriveTarget;
  mode: ProjectStatus['mode'];
  readiness: ProjectStatus['readiness'];
  project: BridgeProjectDetails;
}> {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}/derive`, {
    method: 'POST',
    body: JSON.stringify({ target, persist: options?.persist ?? true }),
  });
}

export async function generateProjectRequest(params: {
  projectId: string;
  prompt: string;
  feedback: string | null;
  sessionId?: string | null;
  selectedImageDataUrls?: string[];
  model: ImageModel;
  sizePreset: SizePreset;
  imageCount: number;
}): Promise<{
  sessionId: string;
  run: Run;
  runs: Run[];
}> {
  return requestJson(`/api/projects/${encodeURIComponent(params.projectId)}/generate`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: params.prompt,
      feedback: params.feedback,
      sessionId: params.sessionId ?? undefined,
      selectedImageDataUrls: params.selectedImageDataUrls ?? [],
      model: params.model,
      sizePreset: params.sizePreset,
      imageCount: params.imageCount,
    }),
  });
}

export async function listSessionsRequest(projectId: string): Promise<Session[]> {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}/sessions`);
}

export async function getSessionRequest(projectId: string, sessionId: string): Promise<{ session: Session; runs: Run[] }> {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`);
}

export async function deleteSessionRequest(projectId: string, sessionId: string): Promise<void> {
  await requestJson(`/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}
