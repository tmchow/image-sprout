import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ImageModel, Project, Session, SizePreset } from '../lib/types';
import { CliError } from './errors';
import { extForMimeType, mimeTypeForFilePath, persistGeneratedImage, readFileAsDataUrl } from './io';
import { getDefaultModelId } from './model-registry';
import { ensureAppHome, ensureProjectsPath, getProjectsPath, getStatePath } from './paths';

interface AppState {
  activeProjectId: string | null;
}

interface StoredProjectRecord {
  id: string;
  name: string;
  subjectGuide?: string;
  visualStyle?: string;
  instructions?: string;
  coreInstruction?: string;
  styleDescription?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReferenceRole = 'style' | 'subject' | 'both';
export type DeriveTarget = 'style' | 'subject' | 'both';
export type ProjectMode = 'none' | 'style' | 'subject' | 'both';

interface ReferenceRecord {
  id: string;
  filename: string;
  storedFilename: string;
  role?: ReferenceRole;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt: string;
}

interface SessionRecord extends Session {}

interface StoredRunImageSuccess {
  status: 'success';
  storedFilename: string;
  mimeType: string;
}

interface StoredRunImageError {
  status: 'error';
  error: string;
}

export type StoredRunImage = StoredRunImageSuccess | StoredRunImageError;

export interface StoredRun {
  id: string;
  sessionId: string;
  prompt: string;
  feedback: string | null;
  model: ImageModel;
  sizePreset: SizePreset;
  imageCount: number;
  images: StoredRunImage[];
  createdAt: string;
}

export interface ProjectSummary extends Project {
  referenceCount: number;
  sessionCount: number;
  runCount: number;
  isActive: boolean;
}

export interface ProjectDetails extends ProjectSummary {
  refs: Array<ReferenceRecord & { path: string }>;
}

export interface ProjectStatus {
  projectId: string;
  projectName: string;
  mode: ProjectMode;
  refs: {
    total: number;
    styleOnly: number;
    subjectOnly: number;
    both: number;
    effectiveStyle: number;
    effectiveSubject: number;
  };
  guides: {
    stylePresent: boolean;
    subjectPresent: boolean;
  };
  readiness: {
    style: boolean;
    subject: boolean;
    generate: boolean;
  };
}

export interface ReferenceUpload {
  filename: string;
  dataUrl: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

function now(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `project-${Date.now().toString(36)}`;
}

function ensureJsonDir(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }

    throw new CliError('IO_ERROR', `Failed reading JSON file: ${filePath}`);
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  ensureJsonDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function projectDir(projectId: string): string {
  return path.join(getProjectsPath(), projectId);
}

function projectFile(projectId: string): string {
  return path.join(projectDir(projectId), 'project.json');
}

function refsFile(projectId: string): string {
  return path.join(projectDir(projectId), 'refs.json');
}

function refsDir(projectId: string): string {
  return path.join(projectDir(projectId), 'refs');
}

function sessionsDir(projectId: string): string {
  return path.join(projectDir(projectId), 'sessions');
}

function sessionFile(projectId: string, sessionId: string): string {
  return path.join(sessionsDir(projectId), `${sessionId}.json`);
}

function runsDir(projectId: string): string {
  return path.join(projectDir(projectId), 'runs');
}

function runFile(projectId: string, runId: string): string {
  return path.join(runsDir(projectId), `${runId}.json`);
}

function runImagesDir(projectId: string): string {
  return path.join(runsDir(projectId), 'images');
}

function listJsonBasenames(targetDir: string): string[] {
  try {
    return readdirSync(targetDir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => entry.slice(0, -5));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw new CliError('IO_ERROR', `Failed reading directory: ${targetDir}`);
  }
}

function listProjectIds(): string[] {
  try {
    return readdirSync(getProjectsPath()).filter((entry) => existsSync(path.join(getProjectsPath(), entry, 'project.json')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw new CliError('IO_ERROR', `Failed reading directory: ${getProjectsPath()}`);
  }
}

function readProject(projectId: string): Project {
  const project = readJsonFile<StoredProjectRecord | null>(projectFile(projectId), null);
  if (!project) {
    throw new CliError('NOT_FOUND', `Project not found: ${projectId}`, [
      'Run: image-sprout project list',
    ]);
  }
  return {
    id: project.id,
    name: project.name,
    subjectGuide: project.subjectGuide ?? project.coreInstruction ?? '',
    visualStyle: project.visualStyle ?? project.styleDescription ?? '',
    instructions: project.instructions ?? '',
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function readRefs(projectId: string): ReferenceRecord[] {
  return readJsonFile<ReferenceRecord[]>(refsFile(projectId), []);
}

function writeRefs(projectId: string, refs: ReferenceRecord[]): void {
  writeJsonFile(refsFile(projectId), refs);
}

function normalizeRole(role: string | undefined): ReferenceRole {
  if (role === 'style' || role === 'subject' || role === 'both') {
    return role;
  }
  return 'both';
}

function normalizeRef(ref: ReferenceRecord): ReferenceRecord & { role: ReferenceRole } {
  return {
    ...ref,
    role: normalizeRole(ref.role),
  };
}

function readState(): AppState {
  return readJsonFile<AppState>(getStatePath(), { activeProjectId: null });
}

function writeState(state: AppState): void {
  ensureAppHome();
  writeJsonFile(getStatePath(), state);
}

function readAllProjects(): Project[] {
  return listProjectIds()
    .map((projectId) => readProject(projectId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function roleMatches(role: ReferenceRole, target: Exclude<DeriveTarget, 'both'>): boolean {
  return role === 'both' || role === target;
}

function updateProject(projectId: string, changes: Partial<Project>): Project {
  const current = readProject(projectId);
  const updated: Project = {
    ...current,
    ...changes,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: changes.updatedAt ?? now(),
  };
  writeJsonFile(projectFile(projectId), updated);
  return updated;
}

function assertProjectName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new CliError('INVALID_ARGS', 'Project name is required');
  }
  return trimmed;
}

function sessionCount(projectId: string): number {
  return listJsonBasenames(sessionsDir(projectId)).length;
}

function runCount(projectId: string): number {
  return listJsonBasenames(runsDir(projectId)).length;
}

function readRefsNormalized(projectId: string): Array<ReferenceRecord & { role: ReferenceRole }> {
  return readRefs(projectId).map(normalizeRef);
}

export function getCurrentProjectId(): string | null {
  return readState().activeProjectId;
}

export function setCurrentProject(projectId: string | null): void {
  if (projectId !== null) {
    readProject(projectId);
  }
  writeState({ activeProjectId: projectId });
}

export function resolveProjectId(input?: string): string {
  const requested = input?.trim();
  if (!requested) {
    const current = getCurrentProjectId();
    if (current) {
      return current;
    }
    throw new CliError('INVALID_ARGS', 'Project is required', [
      'Pass --project <name-or-id>',
      'Or run: image-sprout project use <project>',
    ]);
  }

  const projects = readAllProjects();
  const exactId = projects.find((project) => project.id === requested);
  if (exactId) {
    return exactId.id;
  }

  const exactName = projects.find((project) => project.name === requested);
  if (exactName) {
    return exactName.id;
  }

  const insensitiveName = projects.find((project) => project.name.toLowerCase() === requested.toLowerCase());
  if (insensitiveName) {
    return insensitiveName.id;
  }

  throw new CliError('NOT_FOUND', `Project not found: ${requested}`, [
    'Run: image-sprout project list',
  ]);
}

export function listProjects(): ProjectSummary[] {
  ensureProjectsPath();
  const current = getCurrentProjectId();
  return readAllProjects().map((project) => ({
    ...project,
    referenceCount: readRefs(project.id).length,
    sessionCount: sessionCount(project.id),
    runCount: runCount(project.id),
    isActive: current === project.id,
  }));
}

export function createProject(name: string): ProjectSummary {
  ensureProjectsPath();
  const displayName = assertProjectName(name);
  const existing = new Set(readAllProjects().map((project) => project.id));
  const baseId = slugify(displayName);
  let projectId = baseId;
  let index = 2;
  while (existing.has(projectId)) {
    projectId = `${baseId}-${index}`;
    index += 1;
  }

  const timestamp = now();
  const project: Project = {
    id: projectId,
    name: displayName,
    subjectGuide: '',
    visualStyle: '',
    instructions: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  mkdirSync(refsDir(projectId), { recursive: true });
  mkdirSync(sessionsDir(projectId), { recursive: true });
  mkdirSync(runImagesDir(projectId), { recursive: true });
  writeJsonFile(projectFile(projectId), project);
  writeJsonFile(refsFile(projectId), []);
  setCurrentProject(projectId);

  return {
    ...project,
    referenceCount: 0,
    sessionCount: 0,
    runCount: 0,
    isActive: true,
  };
}

export function showProject(input?: string): ProjectDetails {
  const projectId = resolveProjectId(input);
  const project = readProject(projectId);
  const refs = readRefs(projectId).map((ref) => ({
    ...ref,
    path: path.resolve(refsDir(projectId), ref.storedFilename),
  }));

  return {
    ...project,
    refs,
    referenceCount: refs.length,
    sessionCount: sessionCount(projectId),
    runCount: runCount(projectId),
    isActive: getCurrentProjectId() === projectId,
  };
}

export function useProject(input: string): ProjectSummary {
  const projectId = resolveProjectId(input);
  setCurrentProject(projectId);
  return listProjects().find((project) => project.id === projectId) as ProjectSummary;
}

export function deleteProject(input: string): void {
  const projectId = resolveProjectId(input);
  rmSync(projectDir(projectId), { recursive: true, force: true });
  if (getCurrentProjectId() === projectId) {
    setCurrentProject(null);
  }
}

export function listReferences(projectInput?: string): Array<ReferenceRecord & { path: string }> {
  const projectId = resolveProjectId(projectInput);
  return readRefsNormalized(projectId).map((ref) => ({
    ...ref,
    path: path.resolve(refsDir(projectId), ref.storedFilename),
  }));
}

export function addReferences(
  projectInput: string | undefined,
  filePaths: string[],
  role: ReferenceRole = 'both'
): Array<ReferenceRecord & { path: string }> {
  const projectId = resolveProjectId(projectInput);
  if (filePaths.length === 0) {
    throw new CliError('INVALID_ARGS', 'ref add requires at least one file path');
  }

  const current = readRefsNormalized(projectId);
  const added = filePaths.map((sourcePath) => {
    if (!existsSync(sourcePath)) {
      throw new CliError('NOT_FOUND', `Reference file not found: ${sourcePath}`, [
        'Check the input file path',
      ]);
    }

    const mimeType = mimeTypeForFilePath(sourcePath);
    const ext = extForMimeType(mimeType);
    const id = makeId('ref');
    const storedFilename = `${id}.${ext}`;
    const target = path.join(refsDir(projectId), storedFilename);
    copyFileSync(sourcePath, target);

    return {
      id,
      filename: path.basename(sourcePath),
      storedFilename,
      role,
      mimeType,
      width: undefined,
      height: undefined,
      createdAt: now(),
      path: path.resolve(target),
    };
  });

  writeRefs(projectId, [
    ...current,
    ...added.map(({ path: _path, ...ref }) => ref),
  ]);
  updateProject(projectId, {});
  return added;
}

export function addReferenceUploads(
  projectInput: string | undefined,
  uploads: ReferenceUpload[],
  role: ReferenceRole = 'both'
): Array<ReferenceRecord & { path: string }> {
  const projectId = resolveProjectId(projectInput);
  if (uploads.length === 0) {
    throw new CliError('INVALID_ARGS', 'ref add requires at least one uploaded file');
  }

  const current = readRefsNormalized(projectId);
  const added = uploads.map((upload) => {
    const match = /^data:([^;]+);base64,(.+)$/.exec(upload.dataUrl);
    if (!match) {
      throw new CliError('INVALID_ARGS', `Invalid uploaded data URL for ${upload.filename}`);
    }

    const mimeType = upload.mimeType ?? match[1];
    const ext = extForMimeType(mimeType);
    const id = makeId('ref');
    const storedFilename = `${id}.${ext}`;
    const target = path.join(refsDir(projectId), storedFilename);
    writeFileSync(target, Buffer.from(match[2], 'base64'));

    return {
      id,
      filename: upload.filename,
      storedFilename,
      role,
      mimeType,
      width: upload.width,
      height: upload.height,
      createdAt: now(),
      path: path.resolve(target),
    };
  });

  writeRefs(projectId, [
    ...current,
    ...added.map(({ path: _path, ...ref }) => ref),
  ]);
  updateProject(projectId, {});
  return added;
}

export function updateReferenceRole(
  projectInput: string | undefined,
  refId: string,
  role: ReferenceRole
): ReferenceRecord & { path: string } {
  const projectId = resolveProjectId(projectInput);
  const refs = readRefsNormalized(projectId);
  const match = refs.find((ref) => ref.id === refId);
  if (!match) {
    throw new CliError('NOT_FOUND', `Reference not found: ${refId}`);
  }

  const updatedRefs = refs.map((ref) => (ref.id === refId ? { ...ref, role } : ref));
  writeRefs(projectId, updatedRefs);
  updateProject(projectId, {});

  return {
    ...updatedRefs.find((ref) => ref.id === refId)!,
    path: path.resolve(refsDir(projectId), match.storedFilename),
  };
}

export function removeReference(projectInput: string | undefined, refId: string): void {
  const projectId = resolveProjectId(projectInput);
  const refs = readRefs(projectId);
  const match = refs.find((ref) => ref.id === refId);
  if (!match) {
    throw new CliError('NOT_FOUND', `Reference not found: ${refId}`);
  }

  const target = path.join(refsDir(projectId), match.storedFilename);
  if (existsSync(target)) {
    unlinkSync(target);
  }
  writeRefs(projectId, refs.filter((ref) => ref.id !== refId));
  updateProject(projectId, {});
}

export function getProjectReferenceDataUrls(projectInput?: string): string[] {
  const projectId = resolveProjectId(projectInput);
  return readRefsNormalized(projectId).map((ref) =>
    readFileAsDataUrl(path.join(refsDir(projectId), ref.storedFilename))
  );
}

export function getProjectReferenceDataUrlsByTarget(
  projectInput: string | undefined,
  target: Exclude<DeriveTarget, 'both'>
): string[] {
  const projectId = resolveProjectId(projectInput);
  return readRefsNormalized(projectId)
    .filter((ref) => roleMatches(ref.role, target))
    .map((ref) => readFileAsDataUrl(path.join(refsDir(projectId), ref.storedFilename)));
}

export function updateProjectAnalysis(
  projectInput: string | undefined,
  analysis: { visualStyle: string; subjectGuide: string }
): ProjectSummary {
  const projectId = resolveProjectId(projectInput);
  updateProject(projectId, {
    visualStyle: analysis.visualStyle,
    subjectGuide: analysis.subjectGuide,
  });
  return listProjects().find((project) => project.id === projectId) as ProjectSummary;
}

export function updateProjectGuides(
  projectInput: string | undefined,
  changes: Partial<Pick<Project, 'visualStyle' | 'subjectGuide'>>
): ProjectSummary {
  const projectId = resolveProjectId(projectInput);
  updateProject(projectId, changes);
  return listProjects().find((project) => project.id === projectId) as ProjectSummary;
}

export function updateProjectDetails(
  projectInput: string | undefined,
  changes: Partial<Pick<Project, 'name' | 'subjectGuide' | 'visualStyle' | 'instructions'>>
): ProjectSummary {
  const projectId = resolveProjectId(projectInput);
  if (changes.name !== undefined) {
    changes.name = assertProjectName(changes.name);
  }
  updateProject(projectId, changes);
  return listProjects().find((project) => project.id === projectId) as ProjectSummary;
}

export function listSessions(projectInput?: string): SessionRecord[] {
  const projectId = resolveProjectId(projectInput);
  return listJsonBasenames(sessionsDir(projectId))
    .map((sessionId) => readJsonFile<SessionRecord | null>(sessionFile(projectId, sessionId), null))
    .filter((session): session is SessionRecord => session !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createSession(projectInput: string | undefined, prompt: string): SessionRecord {
  const projectId = resolveProjectId(projectInput);
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new CliError('INVALID_ARGS', 'Prompt is required to create a session');
  }

  const session: SessionRecord = {
    id: makeId('session'),
    projectId,
    prompt: trimmedPrompt,
    createdAt: now(),
    updatedAt: now(),
  };
  writeJsonFile(sessionFile(projectId, session.id), session);
  updateProject(projectId, {});
  return session;
}

export function getSession(projectInput: string | undefined, sessionId: string): SessionRecord {
  const projectId = resolveProjectId(projectInput);
  const session = readJsonFile<SessionRecord | null>(sessionFile(projectId, sessionId), null);
  if (!session) {
    throw new CliError('NOT_FOUND', `Session not found: ${sessionId}`);
  }
  return session;
}

export function deleteSession(projectInput: string | undefined, sessionId: string): void {
  const projectId = resolveProjectId(projectInput);
  getSession(projectId, sessionId);

  const runs = listRuns(projectId, sessionId);
  for (const run of runs) {
    for (const imagePath of run.imagePaths) {
      if (existsSync(imagePath)) {
        unlinkSync(imagePath);
      }
    }
    const runPath = runFile(projectId, run.id);
    if (existsSync(runPath)) {
      unlinkSync(runPath);
    }
  }

  const target = sessionFile(projectId, sessionId);
  if (existsSync(target)) {
    unlinkSync(target);
  }
  updateProject(projectId, {});
}

function touchSession(projectId: string, sessionId: string): SessionRecord {
  const session = getSession(projectId, sessionId);
  const updated: SessionRecord = {
    ...session,
    updatedAt: now(),
  };
  writeJsonFile(sessionFile(projectId, sessionId), updated);
  return updated;
}

export async function createRun(params: {
  project: string | undefined;
  prompt: string;
  feedback: string | null;
  model?: ImageModel;
  sizePreset: SizePreset;
  imageCount: number;
  sessionId?: string;
  imagePayloads: Array<{ imageData: string; status: 'success'; error?: never } | { status: 'error'; error: string; imageData?: never }>;
}): Promise<{ projectId: string; session: SessionRecord; run: StoredRun; imagePaths: string[] }> {
  const projectId = resolveProjectId(params.project);
  const session = params.sessionId
    ? touchSession(projectId, params.sessionId)
    : createSession(projectId, params.prompt);
  const runId = makeId('run');

  const images: StoredRunImage[] = [];
  const imagePaths: string[] = [];
  for (let index = 0; index < params.imagePayloads.length; index += 1) {
    const payload = params.imagePayloads[index];
    if (payload.status === 'error') {
      images.push({ status: 'error', error: payload.error });
      continue;
    }

    const stored = await persistGeneratedImage(payload.imageData, runImagesDir(projectId), runId, index);
    images.push({
      status: 'success',
      storedFilename: path.basename(stored.path),
      mimeType: stored.mimeType,
    });
    imagePaths.push(stored.path);
  }

  const run: StoredRun = {
    id: runId,
    sessionId: session.id,
    prompt: params.prompt.trim(),
    feedback: params.feedback,
    model: params.model ?? getDefaultModelId(),
    sizePreset: params.sizePreset,
    imageCount: params.imageCount,
    images,
    createdAt: now(),
  };
  writeJsonFile(runFile(projectId, run.id), run);
  updateProject(projectId, {});
  return { projectId, session, run, imagePaths };
}

export function listRuns(projectInput?: string, sessionId?: string): Array<StoredRun & { imagePaths: string[] }> {
  const projectId = resolveProjectId(projectInput);
  return listJsonBasenames(runsDir(projectId))
    .map((runId) => readJsonFile<StoredRun | null>(runFile(projectId, runId), null))
    .filter((run): run is StoredRun => run !== null)
    .filter((run) => (sessionId ? run.sessionId === sessionId : true))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((run) => ({
      ...run,
      imagePaths: run.images
        .filter((image): image is StoredRunImageSuccess => image.status === 'success')
        .map((image) => path.resolve(runImagesDir(projectId), image.storedFilename)),
    }));
}

export function getRun(projectInput: string | undefined, runId: string): StoredRun & { imagePaths: string[] } {
  const projectId = resolveProjectId(projectInput);
  const run = readJsonFile<StoredRun | null>(runFile(projectId, runId), null);
  if (!run) {
    throw new CliError('NOT_FOUND', `Run not found: ${runId}`);
  }
  return {
    ...run,
    imagePaths: run.images
      .filter((image): image is StoredRunImageSuccess => image.status === 'success')
      .map((image) => path.resolve(runImagesDir(projectId), image.storedFilename)),
  };
}

export function getProjectStatus(projectInput?: string): ProjectStatus {
  const projectId = resolveProjectId(projectInput);
  const project = readProject(projectId);
  const refs = readRefsNormalized(projectId);

  const styleOnly = refs.filter((ref) => ref.role === 'style').length;
  const subjectOnly = refs.filter((ref) => ref.role === 'subject').length;
  const both = refs.filter((ref) => ref.role === 'both').length;
  const effectiveStyle = refs.filter((ref) => roleMatches(ref.role, 'style')).length;
  const effectiveSubject = refs.filter((ref) => roleMatches(ref.role, 'subject')).length;

  let mode: ProjectMode = 'none';
  if (effectiveStyle > 0 && effectiveSubject > 0) {
    mode = 'both';
  } else if (effectiveStyle > 0) {
    mode = 'style';
  } else if (effectiveSubject > 0) {
    mode = 'subject';
  }

  const stylePresent = project.visualStyle.trim().length > 0;
  const subjectPresent = project.subjectGuide.trim().length > 0;
  const styleReady = effectiveStyle > 0 && stylePresent;
  const subjectReady = effectiveSubject > 0 && subjectPresent;
  const generateReady =
    mode === 'both'
      ? styleReady && subjectReady
      : mode === 'style'
        ? styleReady
        : mode === 'subject'
          ? subjectReady
          : false;

  return {
    projectId,
    projectName: project.name,
    mode,
    refs: {
      total: refs.length,
      styleOnly,
      subjectOnly,
      both,
      effectiveStyle,
      effectiveSubject,
    },
    guides: {
      stylePresent,
      subjectPresent,
    },
    readiness: {
      style: styleReady,
      subject: subjectReady,
      generate: generateReady,
    },
  };
}
