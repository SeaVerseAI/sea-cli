# CLI Design

## Command Grammar

```
sac <resource> [<subcommand>] [flags]
```

## Command Tree

```
sac
├── auth
│   ├── login        --api-key <token>
│   ├── status
│   └── logout
├── generate
│   ├── image        --prompt <text> [--model] [--n] [--width] [--height] [--steps] [--seed] [--cfg-scale] [--negative-prompt] [--image-url] [--action] [--out-dir] [--out-prefix] [--async]
│   └── task         <task-id> [--wait] [--interval <s>] [--timeout <s>] [--output-only-url]
├── chat             --message <text> [--model] [--system] [--messages-file] [--max-tokens] [--temperature] [--stream]
│   ├── models       [--filter]
│   └── set-model    --model <id>
└── config
    ├── show
    └── set          --key <key> --value <value>
```

## API Gateways

| Gateway | Base URL | Purpose |
|---|---|---|
| Multimodal | `${SAC_BASE_URL}/model` | Generation tasks and model skill discovery |
| LLM | `${SAC_BASE_URL}/llm` | Chat completions and LLM model listing |

Authentication: `Authorization: Bearer <token>` on both gateways.

## Multimodal Task Lifecycle

```
POST /model/v1/generation
  → { id, status }

GET /model/v1/generation/task/{id}   (poll every 3s)
  → { status: "in_progress"|"completed"|"failed", progress: 0-1 }

completed → output[].content[].url   (image URLs)
```

## Async Image Generation

`generate image --async` submits the task and returns immediately with the task ID:
```
{ "task_id": "abc123", "status": "in_progress" }
```

Resume with `generate task`:
```bash
# Wait for completion (polls every 3s, respects --timeout)
sac generate task abc123 --wait

# Print only image URLs on completion
sac generate task abc123 --wait --output-only-url

# Single-shot status check (no polling)
sac generate task abc123

# Custom poll interval and timeout
sac generate task abc123 --wait --interval 5 --timeout 120
```

## Task ID Recovery

If `generate image` (sync mode) succeeds in creating the task but polling fails mid-way (network error or timeout), the error output includes the task ID so the generation is not lost:

- **text mode**: stderr shows `Task ID: <id>` + hint to resume with `generate task <id> --wait`
- **json mode**: error object includes `"task_id": "<id>"` field

Example recovery:
```bash
sac generate task <task-id> --wait
sac generate task <task-id> --wait --output-only-url
```

## Output Format Detection

```
--output json  →  JSON
--output text  →  text
(piped / !isTTY)  →  JSON  (automatic)
(TTY)             →  text  (automatic)
```

## Configuration Precedence

```
--api-key flag
  > SAC_API_KEY env var
  > ~/.sac/config.json api_key
  > (no auth — error)

--output flag
  > SAC_OUTPUT env var
  > config file output
  > auto-detect (TTY → text, pipe → json)

--timeout flag
  > SAC_TIMEOUT env var
  > config file timeout
  > 300 (seconds)
```

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | General |
| 2 | Usage / bad args |
| 3 | Auth failure |
| 4 | Quota exceeded |
| 5 | Timeout |
| 6 | Network error |
| 10 | Content filtered |
| 130 | Interrupted (Ctrl+C) |
