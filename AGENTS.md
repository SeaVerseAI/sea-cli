# AGENTS.md — Developer & Agent Guidelines

Guidelines for humans and AI agents contributing to this repository.

## Project Overview

| Field | Value |
|---|---|
| Name | `sac-cli` |
| Binary | `sac` |
| Runtime | Node.js ≥ 18 |
| Language | TypeScript (strict) |
| Build | esbuild (single-file bundle) |
| Output | `dist/sac.mjs` |

## Build & Run

```bash
npm install          # Install dependencies
npm run build        # Build dist/sac.mjs
npm run lint         # ESLint static analysis (src/ test/ build.ts)
npm run typecheck    # Type-check without emitting
npm test             # Compile and run the full test suite

# Build and run
npm run build && node dist/sac.mjs --help
```

Build output: `dist/sac.mjs` (~83KB, single file with shebang).

### Pre-commit checklist

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

All four must pass before committing.

## Project Structure

```
src/
  main.ts              # Entry: argv parsing, auth check, command dispatch
  command.ts           # Command interface, defineCommand(), GLOBAL_OPTIONS
  registry.ts          # Command registry + help renderer (ASCII logo here)
  args.ts              # Custom flag parser (no third-party arg library)
  config/
    schema.ts          # Config/ConfigFile interfaces, gateway URL constants
    loader.ts          # loadConfig(): flag > env > file > defaults
    paths.ts           # ~/.sac/ directory and config.json path
  auth/
    resolver.ts        # resolveApiKey(): flag > env > config
    probe.ts           # probeApiKey(): validates key via nonexistent task lookup
  client/
    http.ts            # request() / requestJson(), injects Bearer token
    endpoints.ts       # All API endpoint URLs (add new endpoints here)
    stream.ts          # SSE async generator for streaming responses
  errors/
    base.ts            # CLIError class (exitCode + hint)
    codes.ts           # ExitCode enum
    handler.ts         # Top-level error formatter + process.exit
  output/
    formatter.ts       # detectOutputFormat() + formatOutput()
    json.ts / text.ts  # Format implementations
    progress.ts        # createSpinner() (TTY-only)
  polling/
    poll.ts            # pollTask(): polls generation task with retry
  files/
    download.ts        # downloadFile(): streaming file download
  utils/
    env.ts             # isInteractive()
    prompt.ts          # promptText(), promptConfirm(), failIfMissing()
    token.ts           # maskToken() for log redaction
  types/
    flags.ts           # GlobalFlags interface
  commands/
    auth/              # login, status, logout
    generate/          # image, video, audio, task, provider registry
    chat/              # index (chat), models, set-model
    config/            # show, set
```

## Adding a New Command

1. Create `src/commands/<category>/<name>.ts`, export via `defineCommand()`
2. Import and register in `src/registry.ts` (3 places: import, `new CommandRegistry({})`, help text)
3. If auth is not required, add to `NO_AUTH_SETUP` in `src/main.ts`
4. New API endpoints go in `src/client/endpoints.ts` — never hardcode URLs in command files

## Code Style

- **TypeScript strict mode** — no `any` unless absolutely necessary
- **Files**: kebab-case (`set-model.ts`)
- **Functions/variables**: camelCase
- **Constants**: SCREAMING_SNAKE_CASE
- **Types/interfaces**: PascalCase
- **Errors**: always `throw new CLIError(message, ExitCode.X, hint?)` — never `throw new Error()`
- **Interactive prompts**: use `promptText()` / `promptConfirm()` from `src/utils/prompt.ts` — do not import `@clack/prompts` directly
- **Output**: stdout for data, stderr for status/progress/errors
- **No speculative abstractions**: solve the problem at hand, not hypothetical future ones

## Flag Parser Rules

The custom parser in `src/args.ts`:
- `--flag` (no `<value>`) → boolean (or set `type: 'boolean'` explicitly)
- `--flag <value>` → string
- `type: 'number'` → auto `Number(value)`
- `type: 'array'` → collects multiple occurrences into array
- Flag names auto-convert kebab→camelCase: `--my-flag` → `flags.myFlag`

## Configuration Priority

`flag > env var > ~/.sac/config.json > built-in default`

Config file is written atomically (`.tmp` → rename). Permissions: 600.

## Authentication Model

- `sac` uses API key auth only
- API key resolution order is `--api-key` > `SAC_API_KEY` > `~/.sac/config.json`
- `sac auth login` validates a candidate key before saving it
- Validation is implemented by querying a random nonexistent generation task:
  `401/403` means invalid key, `404` means key accepted but task missing, network/5xx means validation unknown
- `sac auth status --check` performs the same remote validation without mutating config

## Git Conventions

- Branch: `main`
- Commit style: `feat:`, `fix:`, `chore:`, `docs:`
- Breaking changes: `BREAKING CHANGE:` in commit body + bump MAJOR version
- Do not commit `node_modules/`, generated `dist/` output, local archives, or `*.tgz`
- `dist/sac.mjs` is the local npm publish bundle. Rebuild it before `npm publish`, but do not commit it.

## Versioning & Releases

Version format: `MAJOR.MINOR.PATCH` (Semantic Versioning)

| Change type | Bump |
|---|---|
| New command / optional flag | MINOR |
| Bug fix, docs, refactor | PATCH |
| Remove/rename command, flag, or JSON output field | MAJOR |

**The tag and `package.json` version MUST match.** The npm bundle version is injected from `package.json` during `npm run build`, so always rebuild immediately before `npm publish`.

**Release steps (in order):**

```bash
# 1. Edit package.json version field
# 2. Rebuild locally to inject the new version into the npm bundle
npm run build
# 3. Commit source/docs/metadata only; do not commit dist/
git add package.json package-lock.json src test README.md AGENTS.md CLAUDE.md skill .gitignore LICENSE && git commit -m "chore: release X.Y.Z"
# 4. Push commit, then tag if needed
git push && git tag vX.Y.Z && git push origin vX.Y.Z
# 5. Publish the npm package
npm publish --access public
```

Never tag before building. Never tag without updating `package.json`.

## Backward Compatibility (Mandatory)

Every new feature MUST be backward compatible. Agents parse `--output json` output programmatically — breaking changes cause silent failures.

**Never (without MAJOR bump):**
- Remove or rename an existing command, subcommand, or flag
- Change a JSON output field name or type
- Change the meaning of an exit code

**Always safe:**
- Add new commands or optional flags
- Add new fields to JSON output
- Fix bugs without changing the happy-path output format

If a mode intentionally emits raw text or streaming output, reject `--output json` explicitly instead of silently ignoring it or changing formats behind the user's back.

Before merging, ask: *Would existing agent scripts that parse `--output json` or check `$?` break?* If yes → MAJOR bump required.

## Common Tasks

**Add a config key:**
1. Add field to `ConfigFile` interface in `src/config/schema.ts`
2. Add parsing in `parseConfigFile()`
3. Add to `Config` interface if needed in runtime
4. Add to `loadConfig()` in `src/config/loader.ts`
5. Add to `VALID_KEYS` in `src/commands/config/set.ts`

**Add a new image model:**
1. Add to `IMAGE_MODELS` array in `src/commands/generate/image.ts`
2. If you have the `model_ver_no`, add to `DEFAULT_MODEL_VER` map in the same file

**Add a new API endpoint:**
1. Add a function to `src/client/endpoints.ts`
2. Use `config.multimodalBaseUrl` or `config.llmBaseUrl` as base
