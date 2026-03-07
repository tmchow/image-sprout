import type { GenerationResult, Run, RunImage } from '../types';
import { generateProjectRequest, getSessionRequest, deleteSessionRequest } from '../api/local-bridge';
import { activeProject, activeProjectId, setDeleteActiveProjectHandler, setSwitchProjectHandler } from './projects.svelte';
import { settingsState } from './settings.svelte';
import { refreshSessions } from './sessions.svelte';

interface GenerationState {
  status: 'idle' | 'generating' | 'complete' | 'error';
  results: GenerationResult[];
  prompt: string;
  feedback: string;
  error: string | null;
  activeSessionId: string | null;
  activeRunIndex: number;
  sessionRuns: Run[];
  draftActive: boolean;
}

function createInitialState(): GenerationState {
  return {
    status: 'idle',
    results: [],
    prompt: '',
    feedback: '',
    error: null,
    activeSessionId: null,
    activeRunIndex: 0,
    sessionRuns: [],
    draftActive: false,
  };
}

export let generationState = $state<GenerationState>(createInitialState());

export function selectedResults(): GenerationResult[] {
  return generationState.results.filter((r) => r.status === 'success' && r.selected);
}

export function startGeneration(): void {
  generationState.status = 'generating';
  generationState.error = null;
}

export function setResults(images: GenerationResult[], prompt: string): void {
  generationState.status = 'complete';
  generationState.results = images;
  generationState.prompt = prompt;
}

export function toggleSelection(index: number): void {
  if (index < 0 || index >= generationState.results.length) {
    return;
  }
  generationState.results[index].selected = !generationState.results[index].selected;
}

export function clearSelection(): void {
  for (const result of generationState.results) {
    result.selected = false;
  }
}

export function setFeedback(text: string): void {
  generationState.feedback = text;
}

export function reset(): void {
  generationState.status = 'idle';
  generationState.results = [];
  generationState.prompt = '';
  generationState.feedback = '';
  generationState.error = null;
  generationState.activeSessionId = null;
  generationState.activeRunIndex = 0;
  generationState.sessionRuns = [];
  generationState.draftActive = false;
}

export function startNewSessionDraft(): void {
  reset();
  generationState.draftActive = true;
}

setDeleteActiveProjectHandler(reset);
setSwitchProjectHandler(reset);

function mapRunToResults(run: Run): void {
  generationState.results = run.images.map((img: RunImage): GenerationResult => {
    if (img.status === 'error') {
      return { status: 'error', error: img.error ?? 'Unknown error', selected: false };
    }
    return { status: 'success', imageDataUrl: img.imageDataUrl, selected: false };
  });
  generationState.prompt = run.prompt;
  generationState.feedback = run.feedback ?? '';
}

export async function loadSession(sessionId: string): Promise<void> {
  const projectId = activeProjectId.value;
  if (!projectId) return;
  const { session, runs } = await getSessionRequest(projectId, sessionId);
  generationState.draftActive = false;
  generationState.activeSessionId = sessionId;
  generationState.sessionRuns = runs;
  generationState.prompt = session.prompt;

  if (runs.length > 0) {
    const latestIndex = runs.length - 1;
    generationState.activeRunIndex = latestIndex;
    mapRunToResults(runs[latestIndex]);
    generationState.status = 'complete';
  }
}

export function switchRun(index: number): void {
  if (index < 0 || index >= generationState.sessionRuns.length) return;
  generationState.activeRunIndex = index;
  mapRunToResults(generationState.sessionRuns[index]);
}

export async function deleteSessionFromGeneration(sessionId: string): Promise<void> {
  const projectId = activeProjectId.value;
  if (!projectId) return;
  await deleteSessionRequest(projectId, sessionId);
  if (generationState.activeSessionId === sessionId) {
    reset();
  }
  await refreshSessions(projectId);
}

export async function generate(params: { prompt: string }): Promise<void> {
  startGeneration();
  try {
    const project = activeProject();
    const projectId = activeProjectId.value;
    if (!projectId || !project) {
      throw new Error('No active project');
    }

    const result = await generateProjectRequest({
      projectId,
      prompt: params.prompt,
      feedback: generationState.feedback || null,
      sessionId: generationState.activeSessionId,
      selectedImageDataUrls: selectedResults()
        .filter((item): item is Extract<GenerationResult, { status: 'success' }> => item.status === 'success')
        .map((item) => item.imageDataUrl),
      model: settingsState.model,
      sizePreset: settingsState.sizePreset,
      imageCount: settingsState.imageCount,
    });

    generationState.draftActive = false;
    generationState.activeSessionId = result.sessionId;
    generationState.sessionRuns = result.runs;
    generationState.activeRunIndex = result.runs.length - 1;
    mapRunToResults(result.run);
    generationState.status = 'complete';
    await refreshSessions(projectId);
  } catch (e) {
    generationState.status = 'error';
    generationState.error = e instanceof Error ? e.message : 'Generation failed';
  }
}
