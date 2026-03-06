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

Important project flow:
```bash
image-sprout project create comic-hero
image-sprout ref add --project comic-hero ./hero.png
image-sprout project derive comic-hero --target both
image-sprout project generate comic-hero --prompt "hero running through rain"
```

### Security
- never echo the raw API key in normal output
- `config show` and `config get apiKey` expose only public/masked status

## Web App Conventions

The web app is a local interface over the same shared state.

Important UX concepts:
- project settings manage refs, derived guides, and instructions
- split style/subject references are optional advanced behavior
- deriving guides in the web app is local until the user saves edits
- sessions/runs are explicit in the sidebar and run strip
- the canvas is for comparison/review, not hidden state

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

## Notes For Agents

- Do not assume the old IndexedDB architecture described in earlier docs still applies.
- Treat `src/cli/project-store.ts` as the canonical persistence layer.
- Treat the web app as a client of the local bridge, not an independent persistence system.
- If changing user-visible CLI behavior, verify both:
  - source tests
  - built CLI output from `dist/cli/index.js`
- If changing canvas or run-strip layout, verify against the real running app when possible, not just tests.
