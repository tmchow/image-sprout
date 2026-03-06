import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeState = {
  currentProjectId: 'proj-1',
  projects: [
    {
      id: 'proj-1',
      name: 'Project One',
      subjectGuide: '',
      visualStyle: '',
      instructions: '',
      createdAt: '2026-03-05T00:00:00.000Z',
      updatedAt: '2026-03-05T00:00:00.000Z',
      referenceCount: 1,
      sessionCount: 0,
      runCount: 0,
      isActive: true,
    },
  ],
  activeProject: {
    id: 'proj-1',
    name: 'Project One',
    subjectGuide: '',
    visualStyle: '',
    instructions: '',
    createdAt: '2026-03-05T00:00:00.000Z',
    updatedAt: '2026-03-05T00:00:00.000Z',
    referenceCount: 1,
    sessionCount: 0,
    runCount: 0,
    isActive: true,
    refs: [
      {
        id: 'ref-1',
        projectId: 'proj-1',
        role: 'both',
        filename: 'ref.png',
        mimeType: 'image/png',
        createdAt: '2026-03-05T00:00:00.000Z',
        dataUrl: 'data:image/png;base64,abc',
      },
    ],
  },
  status: {
    projectId: 'proj-1',
    projectName: 'Project One',
    mode: 'both',
    refs: {
      total: 1,
      styleOnly: 0,
      subjectOnly: 0,
      both: 1,
      effectiveStyle: 1,
      effectiveSubject: 1,
    },
    guides: {
      stylePresent: false,
      subjectPresent: false,
    },
    readiness: {
      style: false,
      subject: false,
      generate: false,
    },
  },
};

vi.mock('../../../src/lib/api/local-bridge', () => ({
  listProjectsRequest: vi.fn(async () => ({
    currentProjectId: bridgeState.currentProjectId,
    projects: bridgeState.projects,
  })),
  getProjectRequest: vi.fn(async () => bridgeState.activeProject),
  createProjectRequest: vi.fn(async () => ({
    project: bridgeState.projects[0],
    currentProjectId: bridgeState.currentProjectId,
    projects: bridgeState.projects,
    activeProject: bridgeState.activeProject,
  })),
  useProjectRequest: vi.fn(async () => ({
    currentProjectId: bridgeState.currentProjectId,
    projects: bridgeState.projects,
    activeProject: bridgeState.activeProject,
  })),
  updateProjectRequest: vi.fn(async () => bridgeState.activeProject),
  deriveProjectRequest: vi.fn(async () => ({
    visualStyle: 'Style',
    subjectGuide: 'Core',
    target: 'both',
    mode: 'both',
    readiness: {
      style: true,
      subject: true,
      generate: true,
    },
    project: { ...bridgeState.activeProject, visualStyle: 'Style', subjectGuide: 'Core' },
  })),
  getProjectStatusRequest: vi.fn(async () => bridgeState.status),
  deleteProjectRequest: vi.fn(async () => ({ currentProjectId: null, projects: [] })),
  addProjectRefs: vi.fn(async () => bridgeState.activeProject.refs),
  removeProjectRef: vi.fn(async () => undefined),
  updateProjectRefRole: vi.fn(async () => bridgeState.activeProject.refs[0]),
}));

import {
  activeProject,
  activeProjectId,
  deriveProject,
  loadProjects,
  projectStatus,
  projects,
  referenceImages,
  resetProjectsStore,
} from '../../../src/lib/stores/projects.svelte';

describe('projects store bridge', () => {
  beforeEach(() => {
    resetProjectsStore();
    vi.clearAllMocks();
  });

  it('loads projects and active project refs from the bridge', async () => {
    await loadProjects();
    expect(projects.length).toBe(1);
    expect(activeProjectId.value).toBe('proj-1');
    expect(activeProject()?.name).toBe('Project One');
    expect(referenceImages.length).toBe(1);
    expect(projectStatus.value?.mode).toBe('both');
  });

  it('updates the active project from derive results', async () => {
    await loadProjects();
    const result = await deriveProject('proj-1');
    expect(activeProject()?.visualStyle).toBe('Style');
    expect(activeProject()?.subjectGuide).toBe('Core');
    expect(result.visualStyle).toBe('Style');
    expect(result.subjectGuide).toBe('Core');
  });

  it('can derive without persisting project changes', async () => {
    await loadProjects();
    const result = await deriveProject('proj-1', 'both', { persist: false });
    expect(activeProject()?.visualStyle).toBe('');
    expect(activeProject()?.subjectGuide).toBe('');
    expect(result.visualStyle).toBe('Style');
    expect(result.subjectGuide).toBe('Core');
  });
});
