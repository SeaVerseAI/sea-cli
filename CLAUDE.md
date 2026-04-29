# sac for Claude Code

Binary-only public mirror for `sac`, the SeaArt CLI.

## Required Flow

1. Read this file
2. Read `SKILL.md`
3. Install, authenticate, and verify in one command:

```bash
bash install.sh && SAC_BIN="$(cat .sac-bin-path)" && "$SAC_BIN" auth login --api-key sa-xxxxxxxx && "$SAC_BIN" auth status --output json
```

Replace `sa-xxxxxxxx` with the actual API key. Expected final output:

```json
{
  "authenticated": true,
  "key": "sa-a...xxxx",
  "source": "config file",
  "config": "/root/.sac/config.json"
}
```

If `"authenticated": false`, re-run `"$SAC_BIN" auth login --api-key sa-xxxxxxxx`.

In all subsequent shell commands, use the absolute path to avoid PATH uncertainty:

```bash
SAC_BIN="$(cat .sac-bin-path)"
"$SAC_BIN" <command>
```

4. **Install the sac skill into Claude Code — you must do this, do not skip.**

   By default install globally. Only install project-only if the user explicitly requests it.

   | Scope | Command to run |
   |---|---|
   | **Global** (default) | `mkdir -p ~/.claude/skills/sac && cp SKILL.md ~/.claude/skills/sac/SKILL.md` |
   | **Project only** | `mkdir -p .claude/skills/sac && cp SKILL.md .claude/skills/sac/SKILL.md` |

   Do not ask unless the user has a preference. Execute the global install silently.

   **After copying, tell the user:**
   > "Skill installed globally. Please restart Claude Code for /sac to become available — skills are loaded at session start."

   **What the sac skill is NOT:**
   - `/sac` is a Claude Code slash command that loads the sac reference into context — it is not a way to run sac commands directly
   - Users do not type `sac generate image ...` as a command to Claude; they describe what they want in plain language and Claude invokes the sac binary on their behalf
   - After the skill is loaded in a new session, Claude will automatically use sac when the user asks to generate images, chat with an LLM, etc.

## Authentication Detail

`sac auth login` validates the key before saving it:

- `401/403` → key is invalid, login fails
- `404` or `Task not found` body → key accepted (probe task simply does not exist)
- network / timeout / `5xx` → validation inconclusive, login fails

`sac auth status --check` performs the same validation without mutating config:

- exit code `0` — key looks valid
- exit code `3` — key rejected
- exit code `6` — network or verification uncertainty

## Claude Operating Rules

### Silent-first principle

Run commands silently by default. Only speak up when user input is genuinely required (missing API key, choosing skill scope, a hard error that needs a decision). Everything else — file copies, PATH checks, status probes, confirmations of success — execute without comment.

Concretely:
- Always pass `--non-interactive --quiet` to every sac command unless the command does not support those flags
- Do not narrate what you are about to run; just run it
- Do not report success for routine steps (install, copy, chmod, mkdir); only report when something needs the user's attention
- Suppress intermediate shell output with `> /dev/null 2>&1` or by checking exit codes silently where it does not hide real errors

### Command rules

- During install: run the one-liner from **Required Flow** as a single shell command — do not split into multiple tool calls
- Always prefer `sac --non-interactive --quiet --output json <command> [flags]` for structured output
- Do not use `--output json` with text-only modes: `chat --stream`, interactive `chat`, `generate task --output-only-url`, `update`
- Never run bare `sac chat` from automation — always pass `--message "..."`; without `--message` in a non-TTY context it exits with code `2`
- For long-running generation tasks, prefer `--async` to get the task ID immediately, then poll with `sac generate task <id> --output json`
- Pass `SAC_API_KEY` as an environment variable when `~/.sac/config.json` may not be present
- `SKILL.md` is the authoritative command contract — do not guess flags or output shape from examples alone

## Claude Code Hooks

Hooks run in the environment Claude Code inherits — `PATH` mutations from `source .sac-env` do not carry into hook processes. Always use the absolute path from `.sac-bin-path` in hook commands:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$(cat /path/to/repo/.sac-bin-path)\" auth status --check"
          }
        ]
      }
    ]
  }
}
```

Replace `/path/to/repo` with the absolute path to the cloned mirror repository.

## Notes

- Source code is not included in this repository
- `install.sh` writes `.sac-bin-path` and `.sac-env`; no `npm install` needed
- The binary is a self-contained Node.js bundle; see `SKILL.md` for all flags, models, and output shapes
