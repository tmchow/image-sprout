export const QUICK_HELP = `image-sprout <command> [options]

Commands:
  project    Manage projects and generation workflow
  ref        Manage project reference images
  session    Inspect project sessions
  run        Inspect saved runs
  model      Manage available image models
  config     Manage local configuration
  web        Launch the interactive local web app
  help       Show command help

Aliases:
  generate   Shorthand for: project generate
  analyze    Shorthand for: project derive

Options:
  --json       Output JSON
  --value PATH Print one field from a JSON result
  --ids        Print only ids from list results
  --limit N    Limit list results
  -h, --help   Show help`;

const PROJECT_HELP = `image-sprout project <subcommand> [options]

Subcommands:
  list       List projects
  create     Create a project
  show       Show one project
  current    Show the current project
  use        Set the current project
  update     Update project details, guides, or instructions
  status     Show project readiness and effective references
  derive     Derive style and/or subject guides
  generate   Generate images for a project
  delete     Delete a project

Examples:
  image-sprout project create comic-hero
  image-sprout project update comic-hero --style "painterly soft greens"
  image-sprout project derive comic-hero --target both
  image-sprout project generate comic-hero --prompt "hero running through neon rain"`;

const REF_HELP = `image-sprout ref <subcommand> [options]

Subcommands:
  list       List references for a project
  add        Add reference images
  update     Change a reference role
  remove     Remove a reference

Examples:
  image-sprout ref add --project comic-hero ./hero.png
  image-sprout ref add --project comic-hero --role style ./palette.jpg
  image-sprout ref update --project comic-hero --role subject <ref-id>`;

const ANALYZE_HELP = `image-sprout analyze [--project <name-or-id>] [--target <style|subject|both>]

Alias for:
  image-sprout project derive <project> [--target <style|subject|both>]`;

const GENERATE_HELP = `image-sprout generate [--project <name-or-id>] --prompt <text>|--prompt-file <path> [options]

Alias for:
  image-sprout project generate <project> --prompt <text>|--prompt-file <path> [--session <id>] [--feedback <text>] [--model <id>] [--size <16:9|1:1|9:16>] [--count <1|2|4|6>] [--force]`;

const SESSION_HELP = `image-sprout session <subcommand> [options]

Subcommands:
  list       List sessions for a project
  show       Show one session
  delete     Delete a session and its runs

Examples:
  image-sprout session list --project comic-hero
  image-sprout session show --project comic-hero <session-id>
  image-sprout session delete --project comic-hero <session-id>`;

const RUN_HELP = `image-sprout run <subcommand> [options]

Subcommands:
  list       List runs for a project
  show       Show one run
  latest     Show the latest run

Examples:
  image-sprout run list --project comic-hero --limit 5
  image-sprout run latest --project comic-hero
  image-sprout run show --project comic-hero <run-id>`;

const WEB_HELP = `image-sprout web [--port <number>] [--open]

Launch the interactive local web app against the shared on-disk project store.

Options:
  --port <number>  Port to listen on (default: 4310)
  --open           Open the app in the default browser`;

const MODELS_HELP = `image-sprout model <subcommand> [options]

Subcommands:
  list               List configured models
  add                Add a model from OpenRouter
  update             Update a model label
  remove             Remove a model
  set-default        Set the default model
  restore-defaults   Restore the built-in model set

Examples:
  image-sprout model list
  image-sprout model add openai/gpt-5-image
  image-sprout model set-default google/gemini-3.1-flash-image-preview`;

const CONFIG_HELP = `image-sprout config <subcommand> [options]

Subcommands:
  show       Show public configuration
  get        Get one config value
  set        Set a config value
  unset      Remove a config value
  path       Show the config file path

Examples:
  image-sprout config show
  image-sprout config set apiKey <your-key>
  image-sprout config get model`;

export function commandHelp(command?: string): string {
  if (!command) {
    return QUICK_HELP;
  }

  switch (command) {
    case 'project':
      return PROJECT_HELP;
    case 'ref':
      return REF_HELP;
    case 'refs':
      return REF_HELP;
    case 'analyze':
      return ANALYZE_HELP;
    case 'generate':
      return GENERATE_HELP;
    case 'session':
      return SESSION_HELP;
    case 'run':
      return RUN_HELP;
    case 'web':
      return WEB_HELP;
    case 'models':
    case 'model':
      return MODELS_HELP;
    case 'config':
      return CONFIG_HELP;
    case 'help':
      return QUICK_HELP;
    default:
      return QUICK_HELP;
  }
}
