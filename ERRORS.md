# ERRORS.md — Error Reference

Complete error scenario reference for `sac`. Useful for agents handling failures programmatically.

## Exit Codes

| Code | Constant | Meaning |
|---|---|---|
| 0 | `SUCCESS` | Command completed successfully |
| 1 | `GENERAL` | Unclassified error |
| 2 | `USAGE` | Bad arguments or missing required flags |
| 3 | `AUTH` | Authentication failed (401/403) |
| 4 | `QUOTA` | Rate limit or quota exceeded (429) |
| 5 | `TIMEOUT` | Request or task timed out |
| 6 | `NETWORK` | Network unreachable, connection refused |
| 10 | `CONTENT_FILTER` | Content moderation rejection |

---

## auth login

| Scenario | Message | Exit Code |
|---|---|---|
| `--api-key` missing in non-interactive mode | `--api-key is required.` | 2 |
| User cancels interactive prompt | `API key is required.` | 3 |

## auth status

| Scenario | Output |
|---|---|
| No key configured | `Not authenticated.` (stdout) + hint on stderr |
| Key found | `Authenticated` + masked key + source |

## generate image

| Scenario | Message | Exit Code |
|---|---|---|
| `--prompt` missing in non-interactive mode | `Missing required argument: --prompt` | 2 |
| Unknown `--model` value | `Unknown model "x". Run \`sac generate image --list-models\` to see all options.` | 2 |
| API returns no `model_ver_no` match | `no model_ver_no found in request` (from API, HTTP 400) | 1 |
| Task fails on server | `Task failed: <api error_message>` | 1 |
| Polling exceeds `--timeout` | `Task timed out.` + task_id + hint to resume | 5 |
| Network error during polling | Retries up to 3 times, then re-throws + task_id + hint to resume | 6 |
| API returns 401/403 | `Authentication failed (HTTP 4xx). URL: ...` | 3 |
| API returns 429 | `Rate limit exceeded. <api message>` | 4 |
| API returns 408/504 | `Request timed out (HTTP 4xx).` | 5 |

**Task ID recovery:** If polling fails after the task is created (network error or timeout), the task ID is
included in the error so the generation is not lost:

- **text mode** stderr: `Task ID: <id>` + `Task is still running. Resume with: sac generate task <id> --wait`
- **json mode** stderr: `{ "error": { ..., "task_id": "<id>", "hint": "..." } }`

## generate task

| Scenario | Message | Exit Code |
|---|---|---|
| No task ID provided | `Task ID is required.` | 2 |
| Task not found (API 404) | `API error: ... (HTTP 404)` | 1 |
| `--wait`: task fails on server | `Task failed: <api error_message>` | 1 |
| `--wait`: exceeds `--timeout` | `Task timed out.` | 5 |
| `--wait`: network error during poll | Retries up to 3 times, then: `Network request failed.` | 6 |

## chat

| Scenario | Message | Exit Code |
|---|---|---|
| No `--message` in non-interactive mode | `Missing required argument: --message` | 2 |
| `--messages-file` not valid JSON | `Failed to parse messages file as JSON: <path>` | 2 |
| `--messages-file` path not found | `File or directory not found: ...` | 1 |
| API error during streaming | Throws mid-stream, partial output may have been written |

## chat models

| Scenario | Message | Exit Code |
|---|---|---|
| Network error | `Network request failed.` | 6 |
| Auth failure | `Authentication failed (HTTP 4xx).` | 3 |

## chat set-model

| Scenario | Message | Exit Code |
|---|---|---|
| `--model` missing in non-interactive mode | `Model is required.` | 2 |

## config set

| Scenario | Message | Exit Code |
|---|---|---|
| `--key` or `--value` missing | `--key and --value are required.` | 2 |
| Unknown key | `Invalid config key "x". Valid keys: ...` | 2 |
| `--key output` with invalid value | `Invalid output "x". Valid values: text, json` | 2 |
| `--key timeout` with non-numeric value | `Invalid timeout "x". Must be a positive number.` | 2 |

---

## Global Errors

### Network

| Scenario | Message | Exit Code |
|---|---|---|
| `fetch` fails (no route, proxy down) | `Network request failed.` | 6 |
| Connection refused | `Network request failed.` | 6 |
| DNS resolution failure | `Network request failed.` | 6 |
| Request timeout (`AbortSignal`) | `Request timed out.` | 5 |

**Note:** Node.js `fetch` requires uppercase proxy variables: `HTTPS_PROXY`, `HTTP_PROXY`. Lowercase `https_proxy` is ignored.

### API HTTP Errors

| HTTP Status | Message | Exit Code |
|---|---|---|
| 401, 403 | `Authentication failed (HTTP 4xx). URL: <url>` | 3 |
| 429 | `Rate limit exceeded. <api message>` | 4 |
| 408, 504 | `Request timed out (HTTP 4xx).` | 5 |
| Other 4xx/5xx | `API error: <api message> (HTTP xxx) URL: <url>` | 1 |

### File System

| Scenario | Message | Exit Code |
|---|---|---|
| File not found | `File or directory not found: ...` | 1 |
| Permission denied | `Permission denied: ...` | 1 |
| Config file corrupted (bad JSON) | `Warning: config file is corrupted...` (stderr, continues) | — |

### Process

| Scenario | Exit Code |
|---|---|
| `Ctrl+C` / SIGINT | 130 |
| stdout EPIPE (pipe closed) | 0 |

---

## JSON Error Format

When output is JSON (piped or `--output json`), errors are written to stderr as:

```json
{
  "error": {
    "code": 3,
    "message": "Authentication failed (HTTP 403).",
    "hint": "Check status: sac auth status\nRe-authenticate: sac auth login --api-key <key>"
  }
}
```

When a polling failure occurs after a task was created, `task_id` is included:

```json
{
  "error": {
    "code": 6,
    "message": "Network request failed.",
    "task_id": "abc123",
    "hint": "Task is still running. Resume with: sac generate task abc123 --wait"
  }
}
```
