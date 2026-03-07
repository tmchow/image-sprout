#!/usr/bin/env node

import { analyzeReferenceImages, generateImages } from '../lib/api/openrouter';
import { SIZE_PRESETS, SUPPORTED_IMAGE_COUNTS, type ImageModel, type SizePreset } from '../lib/types';
import { getBooleanOption, getStringOption, hasOption, parseArgv } from './argv';
import { commandHelp, QUICK_HELP } from './help';
import { asCliError, CliError, EXIT_CODES } from './errors';
import { configGet, configSet, configShow, configUnset, getConfigPath, publicConfig, readConfig } from './config';
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
  addReferences,
  createProject,
  createRun,
  deleteProject,
  deleteSession,
  getProjectStatus,
  getRun,
  getSession,
  getCurrentProjectId,
  getProjectReferenceDataUrlsByTarget,
  listProjects,
  listReferences,
  listRuns,
  listSessions,
  removeReference,
  resolveProjectId,
  showProject,
  updateProjectGuides,
  updateProjectDetails,
  updateReferenceRole,
  useProject,
} from './project-store';
import { readPrompt } from './io';
import { startWebServer } from './web-server';
import type { CliFailure, CliSuccess, CommandContext, ParsedArgv } from './types';
import type { DeriveTarget, ReferenceRole } from './project-store';

declare const __CLI_VERSION__: string | undefined;

const GLOBAL_OPTIONS = new Set(['json', 'text', 'help', 'version', 'value', 'ids', 'limit']);

function resolveVersion(): string {
  if (typeof __CLI_VERSION__ === 'string' && __CLI_VERSION__.length > 0) {
    return __CLI_VERSION__;
  }
  return process.env.npm_package_version ?? '0.0.0';
}

function shouldUseJson(args: ParsedArgv): boolean {
  const forceJson = getBooleanOption(args, 'json');
  const forceText = getBooleanOption(args, 'text');
  if (forceText === true) {
    return false;
  }
  if (forceJson === true) {
    return true;
  }
  return false;
}

function createContext(parsed: ParsedArgv, version: string): CommandContext {
  const hasVersionFlag = hasOption(parsed, 'version');
  const hasHelpFlag = hasOption(parsed, 'help');

  const command = parsed.positionals[0] ?? 'help';
  const json = shouldUseJson(parsed);
  const ids = getBooleanOption(parsed, 'ids') === true;
  const valuePath = getStringOption(parsed, 'value');
  const limit = parsePositiveInt(getStringOption(parsed, 'limit'), 'limit');

  if (ids && valuePath) {
    throw new CliError('INVALID_ARGS', 'Use either --ids or --value, not both');
  }

  return {
    command: hasVersionFlag ? 'version' : hasHelpFlag ? 'help' : command,
    json,
    version,
    ids,
    valuePath,
    limit,
  };
}

function createErrorContext(parsed: ParsedArgv, version: string): CommandContext {
  return {
    command: parsed.positionals[0] ?? 'help',
    json: shouldUseJson(parsed),
    version,
    ids: false,
    valuePath: undefined,
    limit: undefined,
  };
}

function parsePositiveInt(raw: string | undefined, flag: string): number | undefined {
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new CliError('INVALID_ARGS', `Invalid value for --${flag}: ${raw}`);
  }
  return value;
}

function limitItems<T>(items: T[], ctx: CommandContext): T[] {
  return ctx.limit === undefined ? items : items.slice(0, ctx.limit);
}

function getByPath(data: unknown, path: string): unknown {
  const segments = path.split('.').filter(Boolean);
  let current: unknown = data;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) {
        throw new CliError('INVALID_ARGS', `Expected numeric segment for array path: ${segment}`);
      }
      current = current[index];
      continue;
    }
    if (current && typeof current === 'object' && segment in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    throw new CliError('NOT_FOUND', `Value path not found: ${path}`);
  }
  return current;
}

function extractIds(data: unknown): string[] {
  const candidateLists =
    Array.isArray(data)
      ? [data]
      : data && typeof data === 'object'
        ? ['projects', 'refs', 'sessions', 'runs', 'models'].flatMap((key) => {
            const value = (data as Record<string, unknown>)[key];
            return Array.isArray(value) ? [value] : [];
          })
        : [];

  if (candidateLists.length === 0) {
    throw new CliError('INVALID_ARGS', '--ids requires a list result');
  }

  const list = candidateLists[0];
  return list.map((item) => {
    if (typeof item === 'string') {
      return item;
    }
    if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string') {
      return (item as Record<string, string>).id;
    }
    throw new CliError('INVALID_ARGS', '--ids requires list items with an id field');
  });
}

function applySelectors(ctx: CommandContext, data: unknown): unknown {
  if (ctx.ids) {
    return extractIds(data);
  }
  if (ctx.valuePath) {
    return getByPath(data, ctx.valuePath);
  }
  return data;
}

function renderScalarText(data: unknown): string {
  if (Array.isArray(data)) {
    return data.map((item) => renderScalarText(item)).join('\n');
  }
  if (data === null || data === undefined) {
    return '';
  }
  if (typeof data === 'string') {
    return data;
  }
  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data);
  }
  return JSON.stringify(data);
}

function emitSuccess<T>(ctx: CommandContext, data: T, textRenderer: (value: T) => string): void {
  const selectedData = applySelectors(ctx, data);
  if (ctx.json) {
    const payload: CliSuccess<T> = {
      ok: true,
      command: ctx.command,
      data: selectedData as T,
    };
    console.log(JSON.stringify(payload));
    return;
  }

  if (ctx.ids || ctx.valuePath) {
    console.log(renderScalarText(selectedData));
    return;
  }

  console.log(textRenderer(data));
}

function emitError(ctx: CommandContext, error: CliError): void {
  if (ctx.json) {
    const payload: CliFailure = {
      ok: false,
      command: ctx.command,
      error: {
        code: error.code,
        message: error.message,
        suggestions: error.suggestions,
      },
    };
    console.error(JSON.stringify(payload));
    return;
  }

  const lines = [`ERR ${error.code} ${error.message}`];
  for (const suggestion of error.suggestions) {
    lines.push(`hint: ${suggestion}`);
  }
  console.error(lines.join('\n'));
}

function assertOnlyOptions(args: ParsedArgv, allowed: Set<string>): void {
  for (const key of args.options.keys()) {
    if (!allowed.has(key) && !GLOBAL_OPTIONS.has(key)) {
      throw new CliError('INVALID_ARGS', `Unknown option: --${key}`, ['Run: image-sprout help']);
    }
  }
}

function requireApiKey(explicitApiKey: string | undefined): string {
  if (explicitApiKey?.trim()) {
    return explicitApiKey.trim();
  }

  const cfg = readConfig();
  if (cfg.apiKey.trim()) {
    return cfg.apiKey.trim();
  }

  throw new CliError('AUTH_REQUIRED', 'API key is not configured', [
    'Run: image-sprout config set apiKey <key>',
    'Or pass: --api-key <key>',
  ]);
}

function parseSize(input: string | undefined, fallback: SizePreset): SizePreset {
  if (!input) {
    return fallback;
  }
  if ((SIZE_PRESETS as readonly string[]).includes(input)) {
    return input as SizePreset;
  }
  throw new CliError('INVALID_ARGS', `Invalid size: ${input}`, [`Use one of: ${SIZE_PRESETS.join(', ')}`]);
}

function parseCount(input: string | undefined, fallback: number): number {
  if (!input) {
    return fallback;
  }
  const value = Number(input);
  if (!SUPPORTED_IMAGE_COUNTS.includes(value as (typeof SUPPORTED_IMAGE_COUNTS)[number])) {
    throw new CliError('INVALID_ARGS', `count must be one of: ${SUPPORTED_IMAGE_COUNTS.join(', ')}`, [
      'Example: image-sprout generate --count 4 ...',
    ]);
  }
  return value;
}

function parseModel(input: string | undefined, fallback: ImageModel): ImageModel {
  if (!input) {
    return fallback;
  }
  const match = listModelRegistry().find((entry) => entry.id === input);
  if (!match) {
    throw new CliError('INVALID_ARGS', `Unknown model: ${input}`, ['Run: image-sprout model list']);
  }
  return match.id;
}

function parseReferenceRole(input: string | undefined): ReferenceRole {
  if (!input || input === 'both') {
    return 'both';
  }
  if (input === 'style' || input === 'subject') {
    return input;
  }
  throw new CliError('INVALID_ARGS', `Invalid role: ${input}`, [
    'Use one of: style, subject, both',
  ]);
}

function parseDeriveTarget(input: string | undefined): DeriveTarget {
  if (!input || input === 'both') {
    return 'both';
  }
  if (input === 'style' || input === 'subject') {
    return input;
  }
  throw new CliError('INVALID_ARGS', `Invalid target: ${input}`, [
    'Use one of: style, subject, both',
  ]);
}

function requireCurrentProjectId(): string {
  const current = getCurrentProjectId();
  if (!current) {
    throw new CliError('NOT_FOUND', 'No current project is set', [
      'Run: image-sprout project use <project>',
      'Or pass --project <name-or-id>',
    ]);
  }
  return current;
}

function validateProjectReadyForGenerate(projectId: string, forced: boolean): void {
  if (forced) {
    return;
  }

  const status = getProjectStatus(projectId);
  if (status.mode === 'none') {
    throw new CliError('PROJECT_NOT_READY', 'Project has no usable references', [
      `Run: image-sprout ref add --project ${projectId} <files...>`,
    ]);
  }
  if (status.readiness.generate) {
    return;
  }

  const missing: string[] = [];
  if (status.mode === 'style' || status.mode === 'both') {
    if (status.refs.effectiveStyle === 0) {
      missing.push('style references');
    } else if (!status.guides.stylePresent) {
      missing.push('visual style guide');
    }
  }
  if (status.mode === 'subject' || status.mode === 'both') {
    if (status.refs.effectiveSubject === 0) {
      missing.push('subject references');
    } else if (!status.guides.subjectPresent) {
      missing.push('subject guide');
    }
  }

  throw new CliError('PROJECT_NOT_READY', `Project is not ready for generation; missing ${missing.join(' and ')}`, [
    `Run: image-sprout project derive ${projectId}${status.mode === 'both' ? ' --target both' : status.mode === 'style' ? ' --target style' : ' --target subject'}`,
    'Or pass --force to bypass readiness checks',
  ]);
}

function projectFlag(args: ParsedArgv): string | undefined {
  return getStringOption(args, 'project');
}

function requireSubcommand(group: string, value: string | undefined, allowed: string[]): string {
  if (!value) {
    throw new CliError('INVALID_ARGS', `${group} requires a subcommand`, [
      `Use: ${group} ${allowed.join('|')}`,
    ]);
  }
  if (!allowed.includes(value)) {
    throw new CliError('INVALID_ARGS', `Unknown ${group} subcommand: ${value}`, [
      `Use: ${group} ${allowed.join('|')}`,
    ]);
  }
  return value;
}

async function runProject(ctx: CommandContext, args: ParsedArgv, positionals: string[]): Promise<void> {
  assertOnlyOptions(
    args,
    new Set(['name', 'core', 'style', 'subject', 'instructions', 'target', 'prompt', 'prompt-file', 'session', 'feedback', 'model', 'size', 'count', 'api-key', 'force'])
  );
  const sub = requireSubcommand('project', positionals[1] ?? 'list', [
    'list',
    'create',
    'show',
    'current',
    'use',
    'update',
    'status',
    'derive',
    'generate',
    'delete',
  ]);

  switch (sub) {
    case 'list': {
      const data = limitItems(listProjects(), ctx);
      emitSuccess(ctx, { currentProjectId: getCurrentProjectId(), projects: data }, (payload) => {
        const lines = [`ok count=${payload.projects.length} current=${payload.currentProjectId ?? '-'}`];
        for (const project of payload.projects) {
          lines.push(
            `project ${project.id} name=${JSON.stringify(project.name)} refs=${project.referenceCount} sessions=${project.sessionCount} runs=${project.runCount}${project.isActive ? ' current=true' : ''}`
          );
        }
        return lines.join('\n');
      });
      return;
    }

    case 'create': {
      const name = positionals[2];
      if (!name) {
        throw new CliError('INVALID_ARGS', 'project create requires <name>');
      }
      const data = createProject(name);
      emitSuccess(ctx, data, (project) => `ok project=${project.id} name=${JSON.stringify(project.name)} current=true`);
      return;
    }

    case 'show': {
      const data = showProject(positionals[2]);
      emitSuccess(ctx, data, (project) => {
        const lines = [
          `ok project=${project.id} name=${JSON.stringify(project.name)} refs=${project.referenceCount} sessions=${project.sessionCount} runs=${project.runCount}${project.isActive ? ' current=true' : ''}`,
          `style: ${project.visualStyle || ''}`,
          `subject: ${project.subjectGuide || ''}`,
          `instructions: ${project.instructions || ''}`,
        ];
        for (const ref of project.refs) {
          lines.push(`ref ${ref.id} role=${ref.role} ${ref.path}`);
        }
        return lines.join('\n');
      });
      return;
    }

    case 'current': {
      const data = showProject(requireCurrentProjectId());
      emitSuccess(ctx, data, (project) => {
        const lines = [
          `ok current=${project.id} name=${JSON.stringify(project.name)} refs=${project.referenceCount} sessions=${project.sessionCount} runs=${project.runCount}`,
          `style: ${project.visualStyle || ''}`,
          `subject: ${project.subjectGuide || ''}`,
          `instructions: ${project.instructions || ''}`,
        ];
        return lines.join('\n');
      });
      return;
    }

    case 'use': {
      const target = positionals[2];
      if (!target) {
        throw new CliError('INVALID_ARGS', 'project use requires <name-or-id>');
      }
      const data = useProject(target);
      emitSuccess(ctx, data, (project) => `ok current=${project.id} name=${JSON.stringify(project.name)}`);
      return;
    }

    case 'update': {
      const target = positionals[2];
      if (!target) {
        throw new CliError('INVALID_ARGS', 'project update requires <name-or-id>');
      }
      const changes: Partial<{ name: string; subjectGuide: string; visualStyle: string; instructions: string }> = {};
      const name = getStringOption(args, 'name');
      const core = getStringOption(args, 'subject') ?? getStringOption(args, 'core');
      const style = getStringOption(args, 'style');
      const instructions = getStringOption(args, 'instructions');
      if (name !== undefined) changes.name = name;
      if (core !== undefined) changes.subjectGuide = core;
      if (style !== undefined) changes.visualStyle = style;
      if (instructions !== undefined) changes.instructions = instructions;
      if (Object.keys(changes).length === 0) {
        throw new CliError('INVALID_ARGS', 'project update requires at least one of --name, --style, --subject, --instructions');
      }
      const finalProject = showProject(updateProjectDetails(target, changes).id);
      emitSuccess(ctx, finalProject, (project) => `ok project=${project.id} updated=true`);
      return;
    }

    case 'status': {
      const target = positionals[2];
      const data = {
        ...getProjectStatus(target),
        config: publicConfig(readConfig()),
      };
      emitSuccess(ctx, data, (status) => {
        return [
          `ok project=${status.projectId} mode=${status.mode} generateReady=${status.readiness.generate} apiKeyConfigured=${status.config.apiKeyConfigured}`,
          `refs total=${status.refs.total} styleOnly=${status.refs.styleOnly} subjectOnly=${status.refs.subjectOnly} both=${status.refs.both} effectiveStyle=${status.refs.effectiveStyle} effectiveSubject=${status.refs.effectiveSubject}`,
          `guides stylePresent=${status.guides.stylePresent} subjectPresent=${status.guides.subjectPresent}`,
          `readiness style=${status.readiness.style} subject=${status.readiness.subject} generate=${status.readiness.generate}`,
        ].join('\n');
      });
      return;
    }

    case 'derive': {
      await runProjectDerive(ctx, args, positionals[2]);
      return;
    }

    case 'generate': {
      await runProjectGenerate(ctx, args, positionals[2]);
      return;
    }

    case 'delete': {
      const target = positionals[2];
      if (!target) {
        throw new CliError('INVALID_ARGS', 'project delete requires <name-or-id>');
      }
      const projectId = resolveProjectId(target);
      deleteProject(target);
      emitSuccess(ctx, { id: projectId }, (payload) => `ok deleted=${payload.id}`);
      return;
    }
  }
}

function runRef(ctx: CommandContext, args: ParsedArgv, positionals: string[]): void {
  assertOnlyOptions(args, new Set(['project', 'role']));
  const sub = requireSubcommand('ref', positionals[1], ['list', 'add', 'update', 'remove']);
  const project = projectFlag(args);

  switch (sub) {
    case 'list': {
      const projectId = resolveProjectId(project);
      const data = limitItems(listReferences(projectId), ctx);
      emitSuccess(ctx, { projectId, refs: data }, (payload) => {
        const lines = [`ok project=${payload.projectId} refs=${payload.refs.length}`];
        for (const ref of payload.refs) {
          lines.push(`ref ${ref.id} role=${ref.role} ${ref.path}`);
        }
        return lines.join('\n');
      });
      return;
    }

    case 'add': {
      const files = positionals.slice(2);
      const projectId = resolveProjectId(project);
      const data = addReferences(projectId, files, parseReferenceRole(getStringOption(args, 'role')));
      emitSuccess(ctx, { projectId, refs: data }, (payload) => {
        const lines = [`ok project=${payload.projectId} added=${payload.refs.length}`];
        for (const ref of payload.refs) {
          lines.push(`ref ${ref.id} role=${ref.role} ${ref.path}`);
        }
        return lines.join('\n');
      });
      return;
    }

    case 'update': {
      const refId = positionals[2];
      if (!refId) {
        throw new CliError('INVALID_ARGS', 'ref update requires <ref-id>');
      }
      const role = parseReferenceRole(getStringOption(args, 'role'));
      const projectId = resolveProjectId(project);
      const ref = updateReferenceRole(projectId, refId, role);
      emitSuccess(ctx, { projectId, ref }, (payload) => {
        return `ok project=${payload.projectId} ref=${payload.ref.id} role=${payload.ref.role}`;
      });
      return;
    }

    case 'remove': {
      const refId = positionals[2];
      if (!refId) {
        throw new CliError('INVALID_ARGS', 'ref remove requires <ref-id>');
      }
      const projectId = resolveProjectId(project);
      const refs = listReferences(projectId);
      const match = refs.find((ref) => ref.id === refId);
      if (!match) {
        throw new CliError('NOT_FOUND', `Reference not found: ${refId}`);
      }
      removeReference(projectId, refId);
      emitSuccess(ctx, { projectId, refId }, (payload) => `ok project=${payload.projectId} removed=${payload.refId}`);
      return;
    }
  }
}

async function runProjectDerive(
  ctx: CommandContext,
  args: ParsedArgv,
  projectInput: string | undefined
): Promise<void> {
  assertOnlyOptions(args, new Set(['project', 'api-key', 'target', 'analysis-model']));

  const config = readConfig();
  const projectId = resolveProjectId(projectInput ?? projectFlag(args));
  const apiKey = requireApiKey(getStringOption(args, 'api-key'));
  const target = parseDeriveTarget(getStringOption(args, 'target'));
  const analysisModel = getStringOption(args, 'analysis-model') ?? config.analysisModel;

  const styleRefDataUrls =
    target === 'subject' ? [] : getProjectReferenceDataUrlsByTarget(projectId, 'style');
  const subjectRefDataUrls =
    target === 'style' ? [] : getProjectReferenceDataUrlsByTarget(projectId, 'subject');

  if (target === 'style' && styleRefDataUrls.length === 0) {
    throw new CliError('INVALID_ARGS', 'Project has no style references', [
      `Run: image-sprout ref add --project ${projectId} --role style <files...>`,
      `Or use --role both for shared references`,
    ]);
  }
  if (target === 'subject' && subjectRefDataUrls.length === 0) {
    throw new CliError('INVALID_ARGS', 'Project has no subject references', [
      `Run: image-sprout ref add --project ${projectId} --role subject <files...>`,
      `Or use --role both for shared references`,
    ]);
  }
  if (target === 'both' && (styleRefDataUrls.length === 0 || subjectRefDataUrls.length === 0)) {
    throw new CliError('INVALID_ARGS', 'project derive --target both requires both style and subject references', [
      `Run: image-sprout ref add --project ${projectId} --role style <files...>`,
      `Run: image-sprout ref add --project ${projectId} --role subject <files...>`,
      `Or add shared refs with: image-sprout ref add --project ${projectId} --role both <files...>`,
    ]);
  }

  let nextStyle: string | undefined;
  let nextSubject: string | undefined;

  if (target === 'both' && JSON.stringify(styleRefDataUrls) === JSON.stringify(subjectRefDataUrls)) {
    const analysis = await analyzeReferenceImages(styleRefDataUrls, apiKey, undefined, analysisModel);
    nextStyle = analysis.visualStyle;
    nextSubject = analysis.subjectGuide;
  } else if (target === 'both') {
    const [styleAnalysis, subjectAnalysis] = await Promise.all([
      analyzeReferenceImages(styleRefDataUrls, apiKey, undefined, analysisModel),
      analyzeReferenceImages(subjectRefDataUrls, apiKey, undefined, analysisModel),
    ]);
    nextStyle = styleAnalysis.visualStyle;
    nextSubject = subjectAnalysis.subjectGuide;
  } else if (target === 'style') {
    const analysis = await analyzeReferenceImages(styleRefDataUrls, apiKey, undefined, analysisModel);
    nextStyle = analysis.visualStyle;
  } else {
    const analysis = await analyzeReferenceImages(subjectRefDataUrls, apiKey, undefined, analysisModel);
    nextSubject = analysis.subjectGuide;
  }

  updateProjectGuides(projectId, {
    ...(nextStyle !== undefined ? { visualStyle: nextStyle } : {}),
    ...(nextSubject !== undefined ? { subjectGuide: nextSubject } : {}),
  });
  const project = showProject(projectId);
  const status = getProjectStatus(projectId);

  emitSuccess(
    ctx,
    {
      projectId,
      target,
      styleReferenceCount: styleRefDataUrls.length,
      subjectReferenceCount: subjectRefDataUrls.length,
      visualStyle: project.visualStyle,
      subjectGuide: project.subjectGuide,
      instructions: project.instructions,
      readiness: status.readiness,
      mode: status.mode,
    },
    (payload) =>
      `ok project=${payload.projectId} target=${payload.target} mode=${payload.mode} styleReady=${payload.readiness.style} subjectReady=${payload.readiness.subject}\nstyle: ${payload.visualStyle}\nsubject: ${payload.subjectGuide}\ninstructions: ${payload.instructions}`
  );
}

async function runProjectGenerate(
  ctx: CommandContext,
  args: ParsedArgv,
  projectInput: string | undefined
): Promise<void> {
  assertOnlyOptions(
    args,
    new Set(['project', 'prompt', 'prompt-file', 'session', 'feedback', 'model', 'size', 'count', 'api-key', 'force'])
  );

  const config = readConfig();
  const projectId = resolveProjectId(projectInput ?? projectFlag(args));
  const project = showProject(projectId);
  validateProjectReadyForGenerate(projectId, getBooleanOption(args, 'force') === true);
  const apiKey = requireApiKey(getStringOption(args, 'api-key'));
  const model = parseModel(getStringOption(args, 'model'), config.model);
  const modelConfig = getModelConfig(model);
  const sizePreset = parseSize(getStringOption(args, 'size'), config.sizePreset);
  const imageCount = parseCount(getStringOption(args, 'count'), config.imageCount);
  const sessionId = getStringOption(args, 'session');

  if (sessionId) {
    getSession(projectId, sessionId);
  }

  const prompt = await readPrompt(getStringOption(args, 'prompt'), getStringOption(args, 'prompt-file'));
  if (!prompt.trim()) {
    throw new CliError('INVALID_ARGS', 'Prompt is required', [
      'Pass --prompt <text>',
      'Or pass --prompt-file <path>',
      'Or pipe prompt text into stdin',
    ]);
  }

  const results = await generateImages(
    {
      referenceImageDataUrls: getProjectReferenceDataUrlsByTarget(projectId, 'style'),
      visualStyle: project.visualStyle,
      subjectGuide: project.subjectGuide,
      instructions: project.instructions,
      prompt,
      feedback: getStringOption(args, 'feedback') ?? null,
      sizePreset,
      imageCount,
      model,
      requestFormat: modelConfig.requestFormat,
    },
    apiKey
  );

  const stored = await createRun({
    project: projectId,
    prompt,
    feedback: getStringOption(args, 'feedback') ?? null,
    model,
    sizePreset,
    imageCount,
    sessionId,
    imagePayloads: results.map((result) =>
      result.status === 'success'
        ? { status: 'success' as const, imageData: result.imageDataUrl }
        : { status: 'error' as const, error: result.error ?? 'Unknown error' }
    ),
  });

  const successCount = results.filter((result) => result.status === 'success').length;
  const errorCount = results.length - successCount;

  emitSuccess(
    ctx,
    {
      projectId,
      sessionId: stored.session.id,
      runId: stored.run.id,
      prompt,
      model,
      sizePreset,
      imageCount,
      successCount,
      errorCount,
      imagePaths: stored.imagePaths,
      results: stored.run.images,
    },
    (payload) => {
      const lines = [
        `ok project=${payload.projectId} session=${payload.sessionId} run=${payload.runId} success=${payload.successCount} error=${payload.errorCount}`,
      ];
      for (const imagePath of payload.imagePaths) {
        lines.push(`img ${imagePath}`);
      }
      return lines.join('\n');
    }
  );
}

function runSessions(ctx: CommandContext, args: ParsedArgv, positionals: string[]): void {
  assertOnlyOptions(args, new Set(['project']));
  const projectId = resolveProjectId(projectFlag(args));
  const sub = requireSubcommand('session', positionals[1] ?? 'list', ['list', 'show', 'delete']);
  switch (sub) {
    case 'list': {
      const data = limitItems(listSessions(projectId), ctx);
      emitSuccess(ctx, { projectId, sessions: data }, (payload) => {
        const lines = [`ok project=${payload.projectId} sessions=${payload.sessions.length}`];
        for (const session of payload.sessions) {
          lines.push(`session ${session.id} updatedAt=${session.updatedAt} prompt=${JSON.stringify(session.prompt)}`);
        }
        return lines.join('\n');
      });
      return;
    }
    case 'show': {
      const sessionId = positionals[2];
      if (!sessionId) {
        throw new CliError('INVALID_ARGS', 'session show requires <session-id>');
      }
      const session = getSession(projectId, sessionId);
      const runs = listRuns(projectId, sessionId);
      emitSuccess(ctx, { projectId, session, runs }, (payload) => {
        const lines = [
          `ok project=${payload.projectId} session=${payload.session.id} runs=${payload.runs.length}`,
          `prompt: ${payload.session.prompt}`,
        ];
        return lines.join('\n');
      });
      return;
    }
    case 'delete': {
      const sessionId = positionals[2];
      if (!sessionId) {
        throw new CliError('INVALID_ARGS', 'session delete requires <session-id>');
      }
      deleteSession(projectId, sessionId);
      emitSuccess(ctx, { projectId, sessionId }, (payload) => `ok project=${payload.projectId} deleted=${payload.sessionId}`);
      return;
    }
  }
}

function runRuns(ctx: CommandContext, args: ParsedArgv, positionals: string[]): void {
  assertOnlyOptions(args, new Set(['project', 'session']));
  const sub = requireSubcommand('run', positionals[1], ['list', 'show', 'latest']);
  const projectId = resolveProjectId(projectFlag(args));

  switch (sub) {
    case 'list': {
      const sessionId = getStringOption(args, 'session');
      const data = limitItems(listRuns(projectId, sessionId), ctx);
      emitSuccess(ctx, { projectId, sessionId: sessionId ?? null, runs: data }, (payload) => {
        const lines = [`ok project=${payload.projectId} runs=${payload.runs.length}`];
        for (const run of payload.runs) {
          const successCount = run.images.filter((image) => image.status === 'success').length;
          const errorCount = run.images.length - successCount;
          lines.push(`run ${run.id} session=${run.sessionId} success=${successCount} error=${errorCount} createdAt=${run.createdAt}`);
        }
        return lines.join('\n');
      });
      return;
    }

    case 'latest': {
      const sessionId = getStringOption(args, 'session');
      const runs = listRuns(projectId, sessionId);
      const data = runs[runs.length - 1];
      if (!data) {
        throw new CliError('NOT_FOUND', 'No runs found');
      }
      emitSuccess(ctx, { projectId, run: data }, (payload) => {
        return `ok project=${payload.projectId} run=${payload.run.id} session=${payload.run.sessionId}`;
      });
      return;
    }

    case 'show': {
      const runId = positionals[2];
      if (!runId) {
        throw new CliError('INVALID_ARGS', 'run show requires <run-id>');
      }
      const data = getRun(projectId, runId);
      emitSuccess(ctx, { projectId, run: data }, (payload) => {
        const lines = [
          `ok project=${payload.projectId} run=${payload.run.id} session=${payload.run.sessionId} createdAt=${payload.run.createdAt}`,
          `prompt: ${payload.run.prompt}`,
          `feedback: ${payload.run.feedback ?? ''}`,
        ];
        for (const imagePath of payload.run.imagePaths) {
          lines.push(`img ${imagePath}`);
        }
        for (const image of payload.run.images) {
          if (image.status === 'error') {
            lines.push(`err ${image.error}`);
          }
        }
        return lines.join('\n');
      });
      return;
    }
  }
}

async function runModel(ctx: CommandContext, args: ParsedArgv, positionals: string[]): Promise<void> {
  assertOnlyOptions(args, new Set(['label', 'format']));
  const sub = requireSubcommand('model', positionals[1] ?? 'list', [
    'list',
    'add',
    'update',
    'remove',
    'set-default',
    'restore-defaults',
  ]);

  switch (sub) {
    case 'list': {
      const registry = toPublicModelRegistry({
        defaultModelId: getDefaultModelId(),
        models: limitItems(listModelRegistry(), ctx),
      });
      emitSuccess(ctx, registry, (data) => {
        const lines = [`ok default=${data.defaultModelId} count=${data.models.length}`];
        for (const model of data.models) {
          lines.push(`model ${model.id} label=${JSON.stringify(model.label)} source=${model.source}`);
        }
        return lines.join('\n');
      });
      return;
    }
    case 'add': {
      const modelId = positionals[2];
      if (!modelId) {
        throw new CliError('INVALID_ARGS', 'model add requires <openrouter-id>');
      }
      const format = getStringOption(args, 'format');
      const model = await addModelToRegistry({
        id: modelId,
        label: getStringOption(args, 'label') ?? undefined,
        requestFormat: format === 'openai-size' || format === 'image-config' ? format : undefined,
        apiKey: readConfig().apiKey,
      });
      emitSuccess(ctx, toPublicModelConfig(model), (payload) => `ok model=${payload.id} label=${JSON.stringify(payload.label)} source=${payload.source}`);
      return;
    }
    case 'update': {
      const modelId = positionals[2];
      if (!modelId) {
        throw new CliError('INVALID_ARGS', 'model update requires <id>');
      }
      const label = getStringOption(args, 'label');
      const format = getStringOption(args, 'format');
      if (label === undefined && format === undefined) {
        throw new CliError('INVALID_ARGS', 'model update requires --label and/or --format');
      }
      const model = updateModelInRegistry(modelId, {
        ...(label !== undefined ? { label } : {}),
        ...(format === 'openai-size' || format === 'image-config' ? { requestFormat: format } : {}),
      });
      emitSuccess(ctx, toPublicModelConfig(model), (payload) => `ok model=${payload.id} updated=true`);
      return;
    }
    case 'remove': {
      const modelId = positionals[2];
      if (!modelId) {
        throw new CliError('INVALID_ARGS', 'model remove requires <id>');
      }
      const registry = removeModelFromRegistry(modelId);
      emitSuccess(ctx, { removed: modelId, defaultModelId: registry.defaultModelId }, (payload) => `ok removed=${payload.removed}`);
      return;
    }
    case 'set-default': {
      const modelId = positionals[2];
      if (!modelId) {
        throw new CliError('INVALID_ARGS', 'model set-default requires <id>');
      }
      const registry = setDefaultModel(modelId);
      emitSuccess(ctx, { defaultModelId: registry.defaultModelId }, (payload) => `ok default=${payload.defaultModelId}`);
      return;
    }
    case 'restore-defaults': {
      const registry = toPublicModelRegistry(restoreDefaultModels());
      emitSuccess(ctx, registry, (payload) => `ok restored default=${payload.defaultModelId} count=${payload.models.length}`);
      return;
    }
  }
}

function runConfig(ctx: CommandContext, args: ParsedArgv, positionals: string[]): void {
  assertOnlyOptions(args, new Set());

  const sub = positionals[1] ?? 'show';
  switch (sub) {
    case 'show': {
      if (positionals.length > 2) {
        throw new CliError('INVALID_ARGS', 'config show takes no positional args');
      }

      const data = configShow();
      emitSuccess(
        ctx,
        {
          path: getConfigPath(),
          config: data,
        },
        (payload) => {
          const lines = [
            `ok path=${payload.path}`,
            `apiKey=${payload.config.apiKeyConfigured ? '[set]' : '[empty]'}`,
            `model=${payload.config.model}`,
            `sizePreset=${payload.config.sizePreset}`,
            `imageCount=${payload.config.imageCount}`,
          ];
          if (payload.config.analysisModel) {
            lines.push(`analysisModel=${payload.config.analysisModel}`);
          }
          return lines.join('\n');
        }
      );
      return;
    }

    case 'path': {
      if (positionals.length > 2) {
        throw new CliError('INVALID_ARGS', 'config path takes no positional args');
      }
      const value = getConfigPath();
      emitSuccess(ctx, { path: value }, (payload) => `ok ${payload.path}`);
      return;
    }

    case 'get': {
      const key = positionals[2];
      if (!key) {
        throw new CliError('INVALID_ARGS', 'config get requires <key>', [
          'Run: image-sprout config get model',
        ]);
      }
      const value = configGet(key);
      emitSuccess(ctx, value, (payload) =>
        payload.key === 'apiKey'
          ? `ok apiKey=${payload.configured ? '[set]' : '[empty]'}`
          : `ok ${payload.key}=${String(payload.value)}`
      );
      return;
    }

    case 'set': {
      const key = positionals[2];
      if (!key) {
        throw new CliError('INVALID_ARGS', 'config set requires <key> <value>');
      }
      const value = positionals[3];
      if (value === undefined) {
        throw new CliError('INVALID_ARGS', 'config set requires <key> <value>');
      }

      const data = configSet(key, value);
      emitSuccess(ctx, { path: getConfigPath(), config: data }, (payload) => {
        return `ok updated path=${payload.path}`;
      });
      return;
    }

    case 'unset': {
      const key = positionals[2];
      if (!key) {
        throw new CliError('INVALID_ARGS', 'config unset requires <key>');
      }
      const data = configUnset(key);
      emitSuccess(ctx, { path: getConfigPath(), config: data }, (payload) => {
        return `ok unset path=${payload.path}`;
      });
      return;
    }

    default:
      throw new CliError('NOT_FOUND', `Unknown config subcommand: ${sub}`, [
        'Use: config show|get|set|unset|path',
      ]);
  }
}

function runHelp(ctx: CommandContext, target?: string): void {
  const text = commandHelp(target);
  if (ctx.json) {
    emitSuccess(ctx, { text }, (payload) => payload.text);
    return;
  }
  console.log(text);
}

function runVersion(ctx: CommandContext): void {
  emitSuccess(ctx, { version: ctx.version }, (payload) => payload.version);
}

async function openInBrowser(url: string): Promise<void> {
  const { platform } = process;
  const { exec } = await import('node:child_process');
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`);
}

async function runWeb(ctx: CommandContext, args: ParsedArgv): Promise<void> {
  assertOnlyOptions(args, new Set(['port', 'open']));
  const rawPort = getStringOption(args, 'port');
  const parsedPort = rawPort ? Number(rawPort) : undefined;
  if (
    rawPort &&
    (parsedPort === undefined || !Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)
  ) {
    throw new CliError('INVALID_ARGS', `Invalid port: ${rawPort}`);
  }
  const shouldOpen = getBooleanOption(args, 'open') === true;
  const server = await startWebServer({ port: parsedPort });
  if (shouldOpen) {
    await openInBrowser(server.url);
  }
  emitSuccess(ctx, server, (payload) => `ok url=${payload.url}`);
}

async function dispatch(args: ParsedArgv, ctx: CommandContext): Promise<void> {
  if (ctx.command === 'help') {
    runHelp(ctx, args.positionals[1]);
    return;
  }

  if (ctx.command === 'version') {
    runVersion(ctx);
    return;
  }

  switch (ctx.command) {
    case 'project':
      await runProject(ctx, args, args.positionals);
      return;
    case 'ref':
    case 'refs':
      runRef(ctx, args, args.positionals);
      return;
    case 'analyze':
      await runProjectDerive(ctx, args, projectFlag(args));
      return;
    case 'generate':
      await runProjectGenerate(ctx, args, projectFlag(args));
      return;
    case 'session':
      runSessions(ctx, args, args.positionals);
      return;
    case 'run':
      runRuns(ctx, args, args.positionals);
      return;
    case 'web':
      await runWeb(ctx, args);
      return;
    case 'model':
    case 'models':
      await runModel(ctx, args, args.positionals);
      return;
    case 'config':
      runConfig(ctx, args, args.positionals);
      return;
    default:
      throw new CliError('NOT_FOUND', `Unknown command: ${ctx.command}`, [
        'Run: image-sprout help',
      ]);
  }
}

export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseArgv(argv);
  const version = resolveVersion();
  const context = createContext(parsed, version);

  if (argv.length === 0) {
    emitSuccess(context, { text: QUICK_HELP }, (payload) => payload.text);
    return EXIT_CODES.SUCCESS;
  }

  if (context.command === 'version') {
    runVersion(context);
    return EXIT_CODES.SUCCESS;
  }

  if (hasOption(parsed, 'help') && parsed.positionals[0] && parsed.positionals[0] !== 'help') {
    runHelp(context, parsed.positionals[0]);
    return EXIT_CODES.SUCCESS;
  }

  await dispatch(parsed, context);
  return EXIT_CODES.SUCCESS;
}

async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv.slice(2));
}

export function handleCliError(error: unknown, argv: string[]): number {
  let parsed: ParsedArgv = { positionals: [], options: new Map() };
  try {
    parsed = parseArgv(argv);
  } catch {
    // fallback
  }
  const context = createErrorContext(parsed, resolveVersion());

  const cliError = asCliError(error);
  emitError(context, cliError);
  return cliError.exitCode;
}

main().catch((error: unknown) => {
  process.exitCode = handleCliError(error, process.argv.slice(2));
});
