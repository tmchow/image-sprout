# Image Sprout

Image Sprout is a local image-generation tool with two interfaces over the same on-disk project model:
- a CLI for shell and agent workflows
- a local web app launched through the CLI bridge

## Commands

```bash
# Web app
npm run dev         # Vite dev server for the Svelte app
npm run build       # Build the web app into dist/app
npm run web         # Build web + CLI, then launch the local web bridge

# CLI
npm run build:cli   # Build the CLI bundle into dist/cli
node dist/cli/index.js help
node dist/cli/index.js project list

# Quality
npm run check       # Svelte + TypeScript checks
npm test            # Run all Vitest tests
npm run test:watch  # Watch tests
```

## Product Model

Image Sprout stores shared state on disk under a per-user app directory.
Both the CLI and the web app read and write the same:
- config
- model registry
- projects
- refs
- sessions
- runs

### Two Modes

1. CLI mode
- entrypoint: `image-sprout` / `node dist/cli/index.js`
- text output by default
- pass `--json` for machine-readable responses
- best for agents, scripts, and explicit project automation

2. Web mode
- entrypoint: `image-sprout web` or `npm run web`
- `--open` opens the app in the default browser
- `--port <number>` sets a custom port (default: 4310)
- launches the Svelte app against the same shared project/config store
- browser talks to the local `/api/*` bridge backed by Node

## Architecture

```text
src/
├── cli/
│   ├── index.ts            # CLI entrypoint and command dispatch
│   ├── help.ts             # Human-facing help text
│   ├── argv.ts             # Arg parsing utilities
│   ├── errors.ts           # Structured CLI errors and exit codes
│   ├── config.ts           # User config (API key, defaults)
│   ├── model-registry.ts   # Shared model registry on disk
│   ├── project-store.ts    # Shared project/session/run/ref persistence on disk
│   ├── paths.ts            # Per-user data/config paths
│   ├── io.ts               # File/data-url helpers
│   └── web-server.ts       # Local bridge server for the web app
│
├── lib/
│   ├── api/
│   │   ├── openrouter.ts   # OpenRouter generation + guide derivation
│   │   └── local-bridge.ts # Browser client for the local bridge
│   ├── components/
│   │   ├── canvas/         # Results grid, run strip, action bar
│   │   ├── drawer/         # Generate / iterate controls
│   │   ├── sidebar/        # Project/session navigation and refs UI
│   │   └── settings/       # Project + model settings modals
│   ├── stores/
│   │   ├── projects.svelte.ts
│   │   ├── generation.svelte.ts
│   │   ├── sessions.svelte.ts
│   │   └── settings.svelte.ts
│   ├── models.config.ts    # Built-in image models and request formats
│   └── types.ts            # Shared domain types
│
├── App.svelte
├── app.css
└── main.ts
```

## Shared Domain Concepts

### Project
A project contains persistent generation context:
- `visualStyle`
- `subjectGuide`
- `instructions`
- reference images
- sessions and runs

### References
Refs are role-aware:
- `both` — affects both guides
- `style` — affects visual style derivation
- `subject` — affects subject guide derivation

### Guides
Projects can derive:
- `visualStyle`
- `subjectGuide`

Guide derivation uses a configurable analysis model (default: `google/gemini-3.1-flash-image-preview`).
The model is set via `config set analysisModel <model-id>` or the `--analysis-model` flag on derive.
When deriving both guides from different reference sets, both API calls run in parallel.

Projects can also store manual `instructions` for persistent generation constraints.
Examples:
- watermark requirements
- framing instructions
- branding requirements

### Sessions and Runs
- Session: one generation thread inside a project
- Run: one prompt/feedback/model/size/count attempt within a session

## Persistence

Disk-backed storage is the source of truth.

Typical project layout:

```text
<app-home>/
  config.json
  state.json
  models.json
  projects/
    <project-id>/
      project.json
      refs.json
      refs/
      sessions/
      runs/
        <run-id>.json
        images/
```

Notes:
- `state.json` stores convenience state like the current project
- `project.json` still supports legacy key reads for `coreInstruction` and `styleDescription`
  while the codebase uses `subjectGuide` and `visualStyle`
- the browser no longer treats IndexedDB as canonical persistence

## CLI Conventions

### Output
- text output is the default
- `--json` switches to structured machine-readable output
- `help` is plain text by default and JSON only with `--json`
- `--value`, `--ids`, and `--limit` are primarily useful with `--json`

### Command Surface

Primary commands:
- `project`
- `ref`
- `session`
- `run`
- `model`
- `config`
- `web`
- `help`

Aliases:
- `generate` — shorthand for `project generate`
- `analyze` — shorthand for `project derive`

Important project flow:
```bash
image-sprout project create comic-hero
image-sprout ref add --project comic-hero ./hero.png
image-sprout project derive comic-hero --target both
image-sprout project generate comic-hero --prompt "hero running through rain"
```

### Session Management
Sessions can be listed, shown, and deleted from the CLI:
```bash
image-sprout session list --project comic-hero
image-sprout session show --project comic-hero <session-id>
image-sprout session delete --project comic-hero <session-id>
```

Deleting a session removes its runs and generated images.

### Image Count
Supported image counts per generation run: 1, 2, 4, 6.
The default is 4. Override per-run with `--count` or set the default with `config set imageCount`.

### Security
- never echo the raw API key in normal output
- `config show` and `config get apiKey` expose only public/masked status

## Configuration

Config keys:
- `apiKey` — OpenRouter API key
- `model` — default generation model
- `sizePreset` — default aspect ratio (`16:9`, `1:1`, `9:16`)
- `imageCount` — default images per run (`1`, `2`, `4`, `6`)
- `analysisModel` — model used for guide derivation (optional; defaults to `google/gemini-3.1-flash-image-preview`)

## Web App Conventions

The web app is a local interface over the same shared state.

Important UX concepts:
- project settings manage refs, derived guides, and instructions
- split style/subject references are optional advanced behavior
- deriving guides in the web app is local until the user saves edits
- sessions/runs are explicit in the sidebar and run strip
- the canvas is for comparison/review, not hidden state

## Web Server HTTP Status Codes

The local bridge maps CLI errors to HTTP status codes:
- `NOT_FOUND` → 404
- `AUTH_REQUIRED` → 401
- `API_ERROR` → 502
- `IO_ERROR` → 500
- `INTERNAL_ERROR` → 500
- `PROJECT_NOT_READY` → 409
- `INVALID_ARGS`, `CONFIG_ERROR`, and others → 400

## OpenRouter Integration

Implemented in `src/lib/api/openrouter.ts`.

Key rules:
- generation uses multimodal chat completions
- Gemini-style models use `image_config`
- OpenAI-style image models use `size`
- model compatibility is mediated through the shared model registry
- custom models must be valid OpenRouter models that:
  - accept image input
  - produce image output

Guide derivation:
- uses a configurable analysis model (exported as `DEFAULT_ANALYSIS_MODEL`)
- accepts an optional `analysisModel` parameter to override the default
- extracts JSON from markdown-fenced responses when the model wraps output in code blocks
- logs a warning when falling back to raw text parsing

Prompt layers currently map to:
- `visualStyle`
- `subjectGuide`
- `instructions`
- run `prompt`
- optional run `feedback`

## Model Registry

Models are shared between CLI and web app.

Storage:
- `models.json` under app home

Behavior:
- built-in defaults come from `src/lib/models.config.ts`
- users can add/remove/update models in CLI and web
- restore defaults is supported
- user-facing labels default to OpenRouter `name` when available
- internal `requestFormat` stays implementation detail, not normal UI

## Svelte 5 Patterns

- stores use runes: `$state`, `$derived`, `$effect`
- prefer explicit `value={...}` + event handlers for form inputs when testability matters
- keep browser state thin; push durable state changes through the bridge-backed stores

## Testing

- Vitest + jsdom + Testing Library
- tests mirror `src/` under `tests/`
- CLI tests live under `tests/cli/`
- component/store tests live under `tests/lib/`

Important patterns:
- many component tests mock the rune stores directly
- when changing CLI defaults, update tests to pass `--json` explicitly where structured output is expected
- `vi.clearAllMocks()` does not reset mock implementations; reset them deliberately in `beforeEach`

## Commits

Use conventional commit messages. The release workflow generates CHANGELOG.md from these prefixes:

- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code restructuring without behavior change
- `chore:` — build, deps, config, CI
- `docs:` — documentation only
- `test:` — adding or updating tests

Include a scope when it clarifies context: `feat(cli): add batch mode`, `fix(canvas): grid overflow`.

Append `!` before the colon for breaking changes: `feat!: remove legacy config format`, `refactor(cli)!: new arg syntax`.

## Agent Skill Files

Two skill files ship with the repo:

| File | Distribution | CI Workflow |
|------|-------------|-------------|
| `skills/agents/SKILL.md` | tmc-marketplace plugin | `sync-skill-to-marketplace.yml` |
| `skills/openclaw/SKILL.md` | ClawHub | `publish-openclaw-skill.yml` |

### tmc-marketplace sync

When `skills/agents/SKILL.md` is changed on `main`, the sync workflow automatically:
1. Copies the updated skill file to tmc-marketplace
2. Commits directly to `main` with a conventional commit (`fix(image-sprout): ...`)
3. release-please in tmc-marketplace picks up the commit and handles the version bump in its next release PR

### OpenClaw / ClawHub publish

When `skills/openclaw/SKILL.md` is changed on `main`, the publish workflow automatically:
1. Publishes the skill to ClawHub using the CLI version from `package.json`
2. Falls back to prerelease suffixes (`<version>-skill.N`) if the base version already exists

Keep both skill files in sync with CLI behavior. If you change commands, flags, defaults, or workflows that the skills document, update both skill files in the same PR.

## ACP Session Task Tracking

When spawned via ACP (Agentic Client Protocol):

1. Break multi-step work into a visible checklist at the start of the task.
2. Signal each item as in-progress before starting it and completed immediately after.
3. The final item marked completed serves as the task-completion checkpoint for the orchestrator.

Use whatever task/todo mechanism your agent runtime provides. The key requirement is that progress is externally observable — not just internal reasoning.

## Notes For Agents

- Do not assume the old IndexedDB architecture described in earlier docs still applies.
- Treat `src/cli/project-store.ts` as the canonical persistence layer.
- Treat the web app as a client of the local bridge, not an independent persistence system.
- If changing user-visible CLI behavior, verify both:
  - source tests
  - built CLI output from `dist/cli/index.js`
- If changing canvas or run-strip layout, verify against the real running app when possible, not just tests.
