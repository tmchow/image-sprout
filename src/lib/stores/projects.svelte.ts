import type { DeriveTarget, Project, ProjectStatus, ReferenceImage, ReferenceRole } from '../types';
import {
  createProjectRequest,
  deleteProjectRequest,
  deriveProjectRequest,
  getProjectRequest,
  getProjectStatusRequest,
  listProjectsRequest,
  updateProjectRequest,
  useProjectRequest,
  addProjectRefs,
  removeProjectRef,
  updateProjectRefRole,
} from '../api/local-bridge';

let _projects = $state<Project[]>([]);
let _activeProjectId = $state<string | null>(null);
let _referenceImages = $state<ReferenceImage[]>([]);
let _projectStatus = $state<ProjectStatus | null>(null);

function _activeProject(): Project | undefined {
  if (_activeProjectId === null) return undefined;
  return _projects.find((p) => p.id === _activeProjectId);
}

export const projects: Project[] = new Proxy([] as Project[], {
  get(_target, prop) {
    return Reflect.get(_projects, prop);
  },
  has(_target, prop) {
    return Reflect.has(_projects, prop);
  },
});

export const activeProjectId = {
  get value() {
    return _activeProjectId;
  },
};

export const activeProject = _activeProject;

export const referenceImages: ReferenceImage[] = new Proxy([] as ReferenceImage[], {
  get(_target, prop) {
    return Reflect.get(_referenceImages, prop);
  },
  has(_target, prop) {
    return Reflect.has(_referenceImages, prop);
  },
});

export const projectStatus = {
  get value() {
    return _projectStatus;
  },
};

let _onDeleteActiveProject: (() => void) | null = null;

export function setDeleteActiveProjectHandler(callback: () => void): void {
  _onDeleteActiveProject = callback;
}

let _onSwitchProject: (() => void) | null = null;

export function setSwitchProjectHandler(callback: () => void): void {
  _onSwitchProject = callback;
}

function applyProjectSelection(data: { currentProjectId: string | null; projects: Project[]; activeProject?: { refs: ReferenceImage[] } | null }): void {
  _projects = data.projects;
  _activeProjectId = data.currentProjectId;
  _referenceImages = data.activeProject?.refs ?? [];
}

async function refreshProjectStatus(projectId: string | null): Promise<void> {
  if (!projectId) {
    _projectStatus = null;
    return;
  }
  _projectStatus = await getProjectStatusRequest(projectId);
}

export async function loadProjects(): Promise<void> {
  const data = await listProjectsRequest();
  _projects = data.projects;
  _activeProjectId = data.currentProjectId;
  _referenceImages = [];
  _projectStatus = null;

  if (data.currentProjectId) {
    const project = await getProjectRequest(data.currentProjectId);
    _referenceImages = project.refs;
    await refreshProjectStatus(data.currentProjectId);
  }
}

export async function createProject(name: string): Promise<Project> {
  const data = await createProjectRequest(name);
  applyProjectSelection(data);
  await refreshProjectStatus(data.currentProjectId);
  return data.project;
}

export async function switchProject(id: string): Promise<void> {
  _onSwitchProject?.();
  const data = await useProjectRequest(id);
  applyProjectSelection(data);
  await refreshProjectStatus(data.currentProjectId);
}

export async function updateProject(
  id: string,
  changes: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Project> {
  const updated = await updateProjectRequest(id, changes);
  _projects = _projects.map((project) => (project.id === id ? updated : project));
  if (_activeProjectId === id) {
    _referenceImages = updated.refs;
    await refreshProjectStatus(id);
  }
  return updated;
}

export async function deriveProject(
  id: string,
  target: DeriveTarget = 'both',
  options?: { persist?: boolean }
): Promise<Awaited<ReturnType<typeof deriveProjectRequest>>> {
  const result = await deriveProjectRequest(id, target, options);
  if (options?.persist !== false) {
    _projects = _projects.map((project) => (project.id === id ? result.project : project));
    if (_activeProjectId === id) {
      _referenceImages = result.project.refs;
      await refreshProjectStatus(id);
    }
  }
  return result;
}

export async function deleteProject(id: string): Promise<void> {
  const wasActive = _activeProjectId === id;
  const data = await deleteProjectRequest(id);
  _projects = data.projects;
  _activeProjectId = data.currentProjectId;
  if (wasActive) {
    _referenceImages = [];
    _onDeleteActiveProject?.();
  }
  if (_activeProjectId) {
    const project = await getProjectRequest(_activeProjectId);
    _referenceImages = project.refs;
    await refreshProjectStatus(_activeProjectId);
  } else {
    _projectStatus = null;
  }
}

export async function addReferenceImage(
  file: File,
  width: number,
  height: number,
  role: ReferenceRole = 'both'
): Promise<ReferenceImage> {
  if (_activeProjectId === null) {
    throw new Error('No active project');
  }

  const [image] = await addProjectRefs(_activeProjectId, [{ file, width, height }], role);
  _referenceImages = [..._referenceImages, image];
  await refreshProjectStatus(_activeProjectId);
  return image;
}

export async function removeReferenceImage(id: string): Promise<void> {
  if (_activeProjectId === null) {
    throw new Error('No active project');
  }
  await removeProjectRef(_activeProjectId, id);
  _referenceImages = _referenceImages.filter((img) => img.id !== id);
  await refreshProjectStatus(_activeProjectId);
}

export async function updateReferenceImageRole(id: string, role: ReferenceRole): Promise<ReferenceImage> {
  if (_activeProjectId === null) {
    throw new Error('No active project');
  }
  const updated = await updateProjectRefRole(_activeProjectId, id, role);
  _referenceImages = _referenceImages.map((img) => (img.id === id ? updated : img));
  await refreshProjectStatus(_activeProjectId);
  return updated;
}

export async function mergeSpecializedReferenceImagesToShared(): Promise<void> {
  if (_activeProjectId === null) {
    throw new Error('No active project');
  }

  const specialized = _referenceImages.filter((img) => img.role !== 'both');
  if (specialized.length === 0) {
    return;
  }

  const updates = await Promise.all(
    specialized.map((img) => updateProjectRefRole(_activeProjectId as string, img.id, 'both'))
  );

  const updateMap = new Map(updates.map((img) => [img.id, img]));
  _referenceImages = _referenceImages.map((img) => updateMap.get(img.id) ?? img);
  await refreshProjectStatus(_activeProjectId);
}

export function resetProjectsStore(): void {
  _projects = [];
  _activeProjectId = null;
  _referenceImages = [];
  _projectStatus = null;
}
