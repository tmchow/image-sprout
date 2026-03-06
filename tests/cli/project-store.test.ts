// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addReferences,
  createProject,
  createRun,
  getCurrentProjectId,
  getProjectStatus,
  getRun,
  showProject,
  listProjects,
  listReferences,
  listRuns,
  listSessions,
  updateReferenceRole,
  updateProjectAnalysis,
} from '../../src/cli/project-store';

const ONE_BY_ONE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8Kx4AAAAASUVORK5CYII=';

describe('project store', () => {
  let appHome = '';
  let priorHome: string | undefined;
  let fixturePath = '';

  beforeEach(() => {
    priorHome = process.env.IMAGE_SPROUT_HOME;
    appHome = mkdtempSync(path.join(tmpdir(), 'image-sprout-project-store-'));
    process.env.IMAGE_SPROUT_HOME = appHome;
    fixturePath = path.join(appHome, 'fixture.png');
    writeFileSync(fixturePath, Buffer.from(ONE_BY_ONE_PNG, 'base64'));
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

  it('creates projects and marks the newest one current', () => {
    const created = createProject('Comic Hero');
    const projects = listProjects();

    expect(created.id).toBe('comic-hero');
    expect(getCurrentProjectId()).toBe(created.id);
    expect(projects).toHaveLength(1);
    expect(projects[0].isActive).toBe(true);
  });

  it('adds refs, stores analysis, and persists runs with images', async () => {
    const project = createProject('Forest Story');
    const refs = addReferences(project.id, [fixturePath]);
    updateProjectAnalysis(project.id, {
      visualStyle: 'Painterly, soft greens',
      subjectGuide: 'Fox protagonist with bright scarf',
    });

    const updated = showProject(project.id);
    expect(updated.instructions).toBe('');

    const stored = await createRun({
      project: project.id,
      prompt: 'fox reading under a pine tree',
      feedback: null,
      sizePreset: '16:9',
      imageCount: 1,
      imagePayloads: [{ status: 'success', imageData: `data:image/png;base64,${ONE_BY_ONE_PNG}` }],
    });

    const sessions = listSessions(project.id);
    const runs = listRuns(project.id);
    const run = getRun(project.id, stored.run.id);

    expect(refs).toHaveLength(1);
    expect(listReferences(project.id)).toHaveLength(1);
    expect(listReferences(project.id)[0].role).toBe('both');
    expect(sessions).toHaveLength(1);
    expect(runs).toHaveLength(1);
    expect(run.images[0].status).toBe('success');
    expect(run.imagePaths).toHaveLength(1);
  });

  it('tracks role-aware reference status', () => {
    const project = createProject('Editorial Style');
    const [ref] = addReferences(project.id, [fixturePath], 'style');
    updateReferenceRole(project.id, ref.id, 'subject');

    const status = getProjectStatus(project.id);

    expect(status.mode).toBe('subject');
    expect(status.refs.total).toBe(1);
    expect(status.refs.effectiveStyle).toBe(0);
    expect(status.refs.effectiveSubject).toBe(1);
  });

  it('reads legacy project fields and persists new guide names', () => {
    const project = createProject('Legacy Project');
    const projectFile = path.join(appHome, 'projects', project.id, 'project.json');
    writeFileSync(
      projectFile,
      JSON.stringify(
        {
          id: project.id,
          name: 'Legacy Project',
          coreInstruction: 'Legacy subject',
          styleDescription: 'Legacy style',
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
        null,
        2
      )
    );

    const loaded = showProject(project.id);
    expect(loaded.subjectGuide).toBe('Legacy subject');
    expect(loaded.visualStyle).toBe('Legacy style');
    expect(loaded.instructions).toBe('');

    updateProjectAnalysis(project.id, {
      subjectGuide: 'New subject',
      visualStyle: 'New style',
    });

    const stored = JSON.parse(readFileSync(projectFile, 'utf8')) as Record<string, unknown>;
    expect(stored.subjectGuide).toBe('New subject');
    expect(stored.visualStyle).toBe('New style');
    expect(stored).not.toHaveProperty('coreInstruction');
    expect(stored).not.toHaveProperty('styleDescription');
  });
});
