---
name: sac
description: Use sac (SeaArt CLI) to generate images, video, audio, and 3D assets, chat with LLMs, inspect task results, or manage SeaArt API credentials and config.
---

# sac — SeaArt CLI Skill

## Prerequisites

### Installation

Preferred npm install:

```bash
npm install -g sac-cli@latest
sac --version
```

Source checkout install for development:

```bash
npm install
npm run build
npm link
sac --version
```

This source checkout remains the canonical command reference for agents.

### Keeping Up to Date

Use the latest npm package unless you are intentionally working from a source checkout:

```bash
npm install -g sac-cli@latest
```

For source checkouts: `git pull && npm install && npm run build`.

`sac update` is informational only. It prints the npm/source update commands and does not download or replace binaries.

### Authentication

```bash
sac auth login --api-key sa-xxxxxxxx --base-url https://gateway.example.com
# or
export SAC_API_KEY=sa-xxxxxxxx
export SAC_BASE_URL=https://gateway.example.com
```

`base_url` is required for `auth login --api-key` validation and for all API calls. `auth login --api-key ... --base-url <url>` persists both the key and the normalized root `base_url`. If the key is already saved, persist the gateway separately with `sac config set --key base_url --value <url>`.

Verify:

```bash
sac auth status
sac auth status --check
```

---

## Agent Flags

Use these flags as the default baseline when running `sac` from an agent context:

| Flag | Purpose |
|---|---|
| `--api-key <token>` | Temporary API key for this command only. Exception: `auth login --api-key` validates and saves it |
| `--base-url <url>` | Temporary gateway base URL for this command only. Exception: `auth login --base-url` validates and saves it |
| `--non-interactive` | Fail immediately on missing required args instead of prompting |
| `--quiet` | Suppress spinners, progress bars, and info messages |
| `--output json` | Machine-readable JSON output on stdout when the command supports it |
| `--async` | Return task ID immediately without waiting for completion |
| `--dry-run` | Preview what would be sent without calling the API |

## Model Discovery Workflow

**Non-negotiable rule for agents:** `generate image`, `generate video`, `generate audio`, and `generate 3d` only cover built-in shortcut models. If the user names a model that is not clearly documented in this SKILL, if `--model` is rejected as unknown, or if you are unsure which flags a model accepts, do **not** keep retrying the generate shortcut and do **not** invent flags. Use the gateway discovery path.

**When the user asks about available models, wants to call a specific model, or references a newly added / gateway-only model, always follow this workflow:**

1. `sac model search` — discover models by type, provider, or modality
2. `sac model get <model-id>` — inspect the Body Template and full field reference
3. `sac generate submit --body-json '...'` — call the model with exact parameters from the template

Decision rules:

- Known built-in model + documented flags in this SKILL: direct `sac generate image/video/audio/3d` is allowed.
- Unknown model name, provider-only request, or model found through search: use `sac model search` -> `sac model get` -> `sac generate submit`.
- `--list-models` only lists local built-in shortcuts; it is not the complete gateway model catalog.
- `model get` output is authoritative for gateway-only models. Fill the Body Template placeholders exactly and preserve required wrapper fields such as `model`, `dash_scope`, `moderation`, `input`, and `metadata`.
- If `model search --query <name>` returns close matches, pick the exact `name` from JSON results; never transform names by guesswork.

```bash
# Example: user wants an image-to-video model from Kling
sac model search --type i2v --provider kling --output json
# → pick model id from results, e.g. kling_v3_i2v

MODEL_SKILL=$(sac model get kling_v3_i2v)
# → $MODEL_SKILL contains Body Template and Fields; never print it

sac generate submit --body-json '{
  "model": "kling_v3_i2v",
  "dash_scope": true,
  "moderation": true,
  "input": [{"params": {"prompt": "...", "image": "https://..."}}],
  "metadata": {}
}'
```

Use `generate image / video / audio / 3d` directly only when the model and flags are already known with certainty. When in doubt, use the discovery workflow above.

## Content Safety

Use content safety when the user asks to review, scan, moderate, or check generated media or an existing media URL.

Direct URL scan:

```bash
sac --non-interactive --quiet --output json content-safety --url https://example.com/image.webp
sac --non-interactive --quiet --output json content-safety --url https://example.com/video.mp4 --video --duration 8
```

Post-generation scan:

```bash
sac --non-interactive --quiet --output json generate image --prompt "..." --content-safety
sac --non-interactive --quiet --output json generate video --prompt "..." --content-safety
sac --non-interactive --quiet --output json generate task <task-id> --wait --content-safety
```

Rules:

- `--content-safety` runs after polling completes and scans returned image/video output URL(s).
- Generated-output content safety is best-effort: failures and timeouts are returned in `safety` and must not be treated as generation failure.
- Do not use `--content-safety` with `generate audio` or `generate 3d`; scan a concrete image/video URL with `content-safety` if needed.
- `--content-safety` cannot be combined with `--async`; scan later with `sac generate task <task-id> --wait --content-safety`.
- `generate task --output-only-url` cannot be combined with `--content-safety`; use structured output instead.
- For video URLs that do not end in a common video extension, pass `--video` on `content-safety`.


**Recommended agent prefix for structured-output commands:**

```bash
sac --non-interactive --quiet --output json <command> [flags]
```

One-off temporary overrides without touching persisted config:

```bash
sac --api-key sa-xxxxxxxx generate image --prompt "..."
sac --base-url https://gateway.example.com generate image --prompt "..."
```

For clarity: `sac auth login --api-key sa-xxxxxxxx` is the persistence path and writes the key to `~/.sac/config.json`. The temporary override meaning only applies to non-login commands.

For `auth login`, `--base-url` is intentionally persistent: it is validated with the key and saved as normalized `base_url`.

`--base-url` accepts:

- gateway root: `https://gateway.example.com` => expands to `/model` and `/llm`
- explicit multimodal base: `https://gateway.example.com/model`
- explicit llm base: `https://gateway.example.com/llm`

Some modes are intentionally text-only and reject `--output json` with a usage error. Current examples: `chat --stream`, interactive `chat`, `generate task --output-only-url`, and `update`.

---

## Commands

### auth login

Validate an API key, then save it to `~/.sac/config.json`.

```bash
sac auth login --api-key sa-xxxxxxxx --base-url https://gateway.example.com
```

**Validation behavior:**

- `sac auth login` checks the key against the API before saving it
- `401/403` means the key is invalid and will not be saved
- `404` from the probe task lookup means the key is valid
- network / timeout / `5xx` means validation is inconclusive and login fails

**Stdout (`--output json`, success):**

```json
{
  "authenticated": true,
  "saved": true,
  "key": "sa-a...xxxx",
  "config": "/Users/you/.sac/config.json",
  "base_url": "https://gateway.example.com",
  "verification": {
    "status": "valid",
    "message": "API key accepted; probe task was not found, as expected.",
    "http_status": 404
  }
}
```

---

### auth status

Check whether an API key is configured. Add `--check` to verify it remotely.

```bash
sac auth status --output json
sac auth status --check --output json
```

**Stdout (`--output json`, authenticated):**

```json
{
  "authenticated": true,
  "key": "sa-a...xxxx",
  "source": "config file",
  "gateway": {
    "base_url": "https://gateway.example.com",
    "source": "config file"
  },
  "config": "/Users/you/.sac/config.json"
}
```

**Stdout (`--check --output json`, authenticated + verified):**

```json
{
  "authenticated": true,
  "key": "sa-a...xxxx",
  "source": "SAC_API_KEY env var",
  "gateway": {
    "base_url": "https://gateway.example.com",
    "source": "SAC_BASE_URL env var"
  },
  "verification": {
    "status": "valid",
    "message": "API key accepted; probe task was not found, as expected.",
    "http_status": 404
  }
}
```

**Stdout (`--output json`, not authenticated):**

```json
{
  "authenticated": false,
  "message": "Not authenticated.",
  "hint": "Run: sac auth login --api-key <token>\nOr set: export SAC_API_KEY=<token>"
}
```

**Exit codes with `--check`:**

- `0` = key looks valid
- `3` = key rejected (`401/403`)
- `6` = verification failed due to network / timeout / server-side uncertainty

---

### auth logout

```bash
sac auth logout
sac auth logout --output json
```

**Stdout (`--output json`, success):**

```json
{
  "removed": true,
  "message": "API key removed from config."
}
```

---

### generate image

Create images. Polls until complete and returns URLs by default.

```bash
sac generate image --prompt "a cat in space"
sac generate image --prompt "product shot" --model kling_v3_image --aspect-ratio 1:1
sac generate image --prompt "国风山水画" --model tencent_image_creation_3 --resolution 1024:1024 --logo-add 1 --revise 1
sac generate image --prompt "make it anime" --image-url https://example.com/input.png --action 1
sac generate image --prompt "text" --n 2
sac generate image --prompt "text" --width 1024 --height 1024
sac generate image --prompt "text" --out-dir ./output
sac generate image --prompt "text" --async
sac generate image --list-models
sac generate image --list-models --provider volces
```

**Flags:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--prompt <text>` | string | required | Image description |
| `--model <id>` | string | `volces_seedream_4_5` | Model ID (overridden by `default_image_model` config if set) |
| `--n <count>` | number | 1 | Number of images |
| `--width <px>` | number | — | Image width |
| `--height <px>` | number | — | Image height |
| `--aspect-ratio <ratio>` | string | — | e.g. `16:9`, `1:1` |
| `--resolution <preset>` | string | — | e.g. `1024:1024` |
| `--seed <n>` | number | — | Random seed |
| `--steps <n>` | number | 20 | Inference steps |
| `--cfg-scale <n>` | number | — | Guidance scale |
| `--negative-prompt <text>` | string | — | Negative prompt |
| `--image-url <url>` | string | — | Input image for i2i |
| `--action <n>` | number | 0 | 0=t2i, 1=i2i, 3=t2i+controlnet, 5=i2i+controlnet |
| `--out-dir <dir>` | string | — | Download images to this directory |
| `--out-prefix <prefix>` | string | `image` | Filename prefix for downloads |
| `--async` | boolean | false | Return task ID without polling |
| `--list-models` | boolean | — | List available models and exit |
| `--provider <id>` | string | — | Filter `--list-models` by provider |

Built-in default model: `volces_seedream_4_5`

**SeaArt models**: `sdxl`, `z_image`, `z_image_turbo`

**Volces models**: `volces_seedream_5`, `volces_seedream_4_5`, `volces_seedream_4_0`, `volces_seedream_3_0`, `volces_seedream_4_5_multi_blend`, `volces_jimeng_3_1`, `volces_jimeng_3_0`, `volces_jimeng_i2i_3_0`, `volces_jimeng_tilesr`, `volces_seededit_3_0`, `volces_seededit_3_0_i2i`, `volces_seededit_single_ip`, `volces_seededit_multi_ip`, `volces_seededit_multi_style`, `volces_seededit_3d_style`, `volces_seededit_portrait`

**Alibaba models**: `alibaba_wan27_image_pro`

**Nano models**: `nano_banana_2`

**Kling models**: `kling_v3_image`, `kling_omni_image`, `kling_v3_omni_image`

**Tencent models**: `tencent_image_creation_3` (supports `--resolution`, `--seed`, `--logo-add 0|1`, `--revise 0|1`)

**`--output json` (polling complete, no `--out-dir`):**

```json
{ "task_id": "d7erdule878c738sr94g", "urls": ["https://image.cdn2.seaart.me/..."] }
```

**`--output json` with `--out-dir`:**

```json
{ "task_id": "d7erdule878c738sr94g", "saved": ["./output/image_001.webp"] }
```

**`--output json` with `--async`:**

```json
{ "task_id": "d7erdule878c738sr94g", "status": "in_progress" }
```

---

### generate video

Create videos. Polls until complete and returns URLs by default.

```bash
sac generate video --prompt "a fox in snow"
sac generate video --prompt "text" --model vidu_q3_pro --async
sac generate video --prompt "text" --model kling_v3 --aspect-ratio 16:9 --duration 5
sac generate video --prompt "car drives away" --model kling_v3_i2v --image-url https://example.com/img.webp
sac generate video --model kling_avatar --image-url https://example.com/avatar.png --audio-url https://example.com/voice.mp3
sac generate video --prompt "你好" --model kling_lipsync --lipsync-mode text2video --video-url https://example.com/face.mp4 --voice-id voice_123 --voice-language zh
sac generate video --model tencent_mps_super_resolution --video-url https://example.com/input.mp4 --resolution 1080P
sac generate video --prompt "commercial" --model vidu_q3_reference --image-urls https://example.com/img.webp
sac generate video --prompt "commercial" --model alibaba_wanx26_reference --reference-urls https://example.com/img.jpg
sac generate video --prompt "a fox in snow" --model volces_seedance_3_0 --resolution 720p
sac generate video --model volces_seedance_30_i2v --image-url https://example.com/first.jpg --prompt "slow push"
sac generate video --prompt "cinematic city at night" --model minimax_hailuo_02 --duration 10 --resolution 768P --prompt-optimizer false
sac generate video --model minimax_hailuo_23_fast_i2v --image-url https://example.com/first.jpg --prompt "gentle push in"
sac generate video --list-models
```

Built-in default model: `volces_seedance_1_5_pro`

**Vidu models**: `vidu_q3_pro` (t2v), `vidu_q3_pro_i2v` (i2v, requires `--image-url`), `vidu_q3_reference` (requires `--image-urls`), `vidu_q3_pro_start_end` (requires `--image-url` start + `--image-tail-url` end), `vidu_template_v2` (requires `--image-url`, `--template`), `vidu_one_click_mv` (requires `--image-urls`, `--audio-url`)

**Kling models**:
- T2V: `kling_v1`, `kling_v1_5`, `kling_v1_6`, `kling_v2_master`, `kling_v2_1_master`, `kling_v2_5_turbo`, `kling_v2_6`, `kling_v3`
- I2V: `kling_v1_i2v`, `kling_v1_5_i2v`, `kling_v1_6_i2v`, `kling_v2_1_i2v`, `kling_v2_master_i2v`, `kling_v2_1_master_i2v`, `kling_v2_5_turbo_i2v`, `kling_v2_6_i2v`, `kling_v3_i2v`
- Avatar: `kling_avatar` (requires `--image-url` + `--audio-url` or `--audio-id`)
- Motion control: `kling_motion_control`, `kling_v3_motion_control` (require `--image-url`, `--video-url`, `--character-orientation image|video`, `--mode std|pro`)
- Effects single: `kling_effects_single` (requires `--image-url`, `--effect-scene`, `--duration`)
- Effects multi: `kling_effects_multi_v1`, `kling_effects_multi_v15`, `kling_effects_multi_v16` (require exactly 2 `--image-urls`, `--effect-scene`, `--duration`)
- Duration extension: `kling_duration_extension` (requires `--video-url`, `--duration`)
- Lipsync: `kling_lipsync` — `--lipsync-mode text2video` (requires `--prompt`, `--video-url`/`--video-id`, `--voice-id`, `--voice-language`) or `--lipsync-mode audio2video` (requires `--audio-url`)
- Omni: `kling_omni_video`, `kling_v3_omni_video` (supports `--image-url`, `--video-url`, `--aspect-ratio`, `--duration`)

**Tencent models**: `tencent_kling_v3`, `tencent_kling_v3_omni`, `tencent_mps_super_resolution` (requires `--video-url`, `--resolution 720P|1080P|2K|4K`, optional `--short 0|1`)

**Alibaba models**: `alibaba_wanx26_t2v` (t2v), `alibaba_wanx26_i2v` (i2v, requires `--image-url`, supports `--resolution 720P|1080P`), `alibaba_wanx26_reference` (requires `--reference-urls`; URLs must be accessible from China — avoid Google Cloud Storage CDN)

**Volces models**: `volces_seedance_1_5_pro`, `volces_seedance_2_0`, `volces_seedance_2_0_fast`, `volces_seedance_3_0`, `volces_seedance_3_0_pro`, `volces_seedance_30_i2v`, `volces_seedance_pro_fast`, `volces_draft_video`, `volces_jimeng_dream_actor_m1`, `volces_jimeng_dream_actor_m2`, `volces_realman_avatar_picture_omni_v2`, `volces_realman_avatar_picture_omni_v15`, `volces_realman_avatar_imitator_v2v`

Key flags: `--duration`, `--size`, `--aspect-ratio`, `--resolution`, `--seed`, `--fps`, `--frames`, `--image-url`, `--image-tail-url`, `--image-urls`, `--video-url`, `--video-id`, `--audio-url`, `--audio-id`, `--voice-id`, `--voice-language`, `--voice-speed`, `--lipsync-mode`, `--effect-scene`, `--character-orientation`, `--keep-original-sound`, `--extension-type`, `--template`, `--reference-urls`, `--mask-urls`, `--audio` (AI audio), `--shot-type` (Wanx t2v)

**`--output json` (polling complete):**

```json
{ "task_id": "...", "urls": ["https://..."] }
```

---

### generate audio

```bash
sac generate audio --prompt "epic orchestral theme"
sac generate audio --prompt "pop anthem" --model mureka_song_generator --lyrics "verse one..."
sac generate audio --model kling_video_to_audio --video-url https://example.com/clip.mp4 --sound-effect-prompt "rain and city"
sac generate audio --prompt "indie folk, wistful, warm guitar" --model minimax_music_25_plus --instrumental --format wav
sac generate audio --prompt "你好，这是一段旁白" --model minimax_t2a --voice-id female-chengshu --voice-speed 1.1 --output-format url
```

Built-in default model: `lyria_3_pro_preview`

**Models**:
- `lyria_3_pro_preview` — music from text prompt; requires `--prompt`
- `mureka_song_generator` — song with lyrics; requires `--lyrics`; optional `--prompt`, `--mureka-model`, `--n`, `--reference-id`, `--vocal-id`, `--melody-id`
- `kling_video_to_audio` — generate audio for a video; requires `--video-url` or `--video-id`; optional `--sound-effect-prompt`, `--n`
- `minimax_music_25`, `minimax_music_25_plus` — MiniMax music generation; supports `--lyrics`, `--lyrics-optimizer`, `--sample-rate`, `--bitrate`, `--format`; `--instrumental` is only supported by `minimax_music_25_plus`
- `minimax_music_generation` — MiniMax music generation with required `--minimax-model`
- `minimax_t2a` — MiniMax text-to-speech; supports `--minimax-model`, `--voice-id`, `--voice-speed`, `--voice-volume`, `--voice-pitch`, `--voice-emotion`, `--sample-rate`, `--bitrate`, `--format`, `--channel`, `--output-format`

**`--output json` (polling complete):**

```json
{ "task_id": "...", "urls": ["https://..."] }
```

---

### generate 3d

```bash
sac generate 3d --prompt "a stylized toy robot"
sac generate 3d --image-url https://example.com/object.png
sac generate 3d --image-urls https://example.com/front.png --image-urls https://example.com/left.png --image-urls https://example.com/back.png --image-urls https://example.com/right.png
sac generate 3d --model tencent_hunyuan_3d --prompt "a carved jade dragon" --result-format GLB --enable-pbr
sac generate 3d --model tencent_hunyuan_3d_pro --image-url https://example.com/obj.png --face-count 80000 --generate-type LowPoly --polygon-type triangle
sac generate 3d --model volces_seed3d --prompt "a ceramic cat" --image-url https://example.com/cat.png
sac generate 3d --list-models
```

Default model routing (Tripo3D):
- prompt only → `tripo3d_text_to_model`
- single `--image-url` → `tripo3d_image_to_model`
- repeated `--image-urls` → `tripo3d_multiview_to_model`
- mixed or Tencent/Volces inputs → pass `--model` explicitly

**Volces**: `volces_seed3d` (requires `--prompt` + `--image-url`)

**Tencent**:
- `tencent_hunyuan_3d` — requires exactly one of `--prompt`/`--image-url`/`--image-base64`; supports `--result-format`, `--enable-pbr`, repeated `--multi-view-image key=url`
- `tencent_hunyuan_3d_pro` — same input; supports `--face-count`, `--generate-type`, `--polygon-type`, `--enable-pbr`
- `tencent_hunyuan_3d_rapid` — same input; supports `--result-format`, `--enable-pbr`

**`--output json` (polling complete):**

```json
{ "task_id": "...", "urls": ["https://..."] }
```

---

### generate task

Query or wait for any generation task by ID.

```bash
sac generate task <task-id>
sac generate task <task-id> --output json
sac generate task <task-id> --output-only-url   # raw URL lines, rejects --output json
```

**`--output json`:**

```json
{
  "id": "d7erdule878c738sr94g",
  "status": "completed",
  "progress": 1,
  "output": [
    {
      "content": [
        { "type": "image", "url": "https://image.cdn2.seaart.me/..." }
      ]
    }
  ]
}
```

Download URLs are at `output[].content[].url`.

---

### generate submit

Submit a raw request body directly to the generation API. Use this when `generate image/video/audio/3d` flags don't cover the params you need, or after `model get` to call a model with full parameter control.

```bash
sac generate submit --body-json '{"model":"kling_v3_i2v","dash_scope":true,"moderation":true,"input":[{"params":{"prompt":"...","image":"https://..."}}],"metadata":{}}'
sac generate submit --body-json '{"model":"comfyuifast","input":[{"params":{"prompt":"1 girl"}}]}' --async
sac generate submit --body-json '...' --out-dir ./output
```

**Flags:**

| Flag | Type | Description |
|---|---|---|
| `--body-json <json>` | string | Complete request body as a JSON string (required) |
| `--out-dir <dir>` | string | Download output files to this directory |
| `--out-prefix <prefix>` | string | Filename prefix for downloads (default: `output`) |
| `--async` | boolean | Return task ID immediately without polling |

---

### model search

Search models (backed by Meilisearch).

```bash
sac model search                                           # list all
sac model search --query kling                             # full-text search
sac model search --input-modality image --output-modality video   # filter by i/o modality
sac model search --type i2v                                # filter by tag abbreviation
sac model search --type i2v --provider alibaba             # combined filter
sac model search --query wan --input-modality image --output-modality video
sac model search --output-modality audio                   # all audio output models
sac model search --output json                             # machine-readable
```

**Filter flags (all repeatable for AND semantics):**

| Flag | Values | Description |
|---|---|---|
| `--query <text>` | any | Full-text search across name, description, skill content |
| `--input-modality <m>` | `text` `image` `video` `audio` | Input modality filter |
| `--output-modality <m>` | `image` `video` `audio` `3d` | Output modality filter |
| `--type <abbr>` | see table below | Tag abbreviation filter |
| `--provider <name>` | `kling` `alibaba` `volces` `vidu` `pixverse` `tencent` `tripo3d` `google` `mureka` `seaart` | Provider filter |
| `--limit <n>` | number | Max results (default: 20) |

**Tag abbreviations (`--type`):**

| Abbr | Full name | 中文 |
|---|---|---|
| `t2i` | text-to-image | 文生图 |
| `i2i` | image-to-image | 图生图 |
| `t2v` | text-to-video | 文生视频 |
| `i2v` | image-to-video | 图生视频 |
| `r2v` | reference-to-video | 参考生视频 |
| `t2a` | text-to-audio | 文生音频 |
| `a2a` | audio-to-audio | 音频生音频 |
| `t23d` | text-to-3d | 文生3D |
| `i23d` | image-to-3d | 图生3D |
| `fx` | effects-template | 特效模板 |
| `vext` | video-extension | 视频延长 |
| `isr` | image-super-resolution | 图像超分 |
| `vsr` | video-super-resolution | 视频超分 |
| `vref` | video-reference | 视频参考 |
| `lipsync` | lipsync | 对口型 |
| `v2a` | video-to-audio | 视频配乐 |
| `vedit` | video-editing | 视频编辑 |
| `lyrics` | lyrics-generation | 歌词生成 |

**`--output json` response:**

```json
{
  "estimatedTotalHits": 12,
  "hits": [
    {
      "id": "kling_v3_i2v",
      "name": "kling_v3_i2v",
      "provider": "kling",
      "description": "Kling AI V3 图生成视频接口",
      "input": ["audio", "image", "text"],
      "output": ["video"],
      "media_type": "video",
      "tags": ["image-to-video"],
      "tags_abbr": ["i2v"]
    }
  ]
}
```

---

### model get

Get the full SKILL.md for a model (body template + fields reference).

**Silent-capture rule: always assign output to a variable — never print `model get` output to the terminal.**

```bash
MODEL_SKILL=$(sac model get kling_v3_i2v)
MODEL_SKILL=$(sac model get alibaba_wanx26_t2v)
```

Returns raw SKILL.md content to stdout. Use with `generate submit` for full parameter control:

```bash
# Discover → inspect → call workflow
sac model search --type i2v --provider kling --output json \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.hits[0].name)"
# → kling_v3_i2v

MODEL_SKILL=$(sac model get kling_v3_i2v)
# → $MODEL_SKILL contains Body Template and required/optional Fields; never print it

sac generate submit --body-json '{
  "model": "kling_v3_i2v",
  "dash_scope": true,
  "moderation": true,
  "input": [{"params": {"prompt": "...", "image": "https://..."}}],
  "metadata": {}
}'
```

---

### chat

**Automation rule: always pass `--message` and `--non-interactive` from scripts or agents.** Without `--message` in a TTY, an interactive REPL starts and blocks on keyboard input. Without `--message` outside a TTY, the command exits with code `2` instead of hanging.

```bash
sac chat --message "Hello" --non-interactive --quiet --output json
sac chat --message "Hello" --stream                  # streaming tokens (text only)
sac chat --model gemini-2.5-pro --message "Hello"
sac chat --system "You are a code reviewer." --message "Review this: ..."
sac chat --message "user:Hi" --message "assistant:Hello" --message "Why?"
sac chat --messages-file messages.json
sac chat --messages-file -                           # read messages array from stdin
sac chat models
sac chat models --filter claude --output json
sac chat set-model --model deepseek-v3-0324
```

Default model: `deepseek-v3-0324`. Override with `--model` or persist with `sac chat set-model`.

**Flags:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--model <id>` | string | `deepseek-v3-0324` | Model ID |
| `--message <text>` | array | — | Message text (repeatable); prefix `role:` to set role |
| `--messages-file <path>` | string | — | JSON messages array file; `-` reads stdin |
| `--system <text>` | string | — | System prompt |
| `--max-tokens <n>` | number | — | Max tokens to generate |
| `--temperature <n>` | number | — | Sampling temperature |
| `--stream` | boolean | auto | Force streaming output |

**Message role syntax:**

```bash
--message "user:What is 2+2?"
--message "assistant:4"
--message "Why?"              # defaults to user role
```

**Messages file format:**

```json
[
  { "role": "system", "content": "You are a helpful assistant." },
  { "role": "user", "content": "Hello" }
]
```

**`--output json` (non-streaming single-turn):**

```json
{
  "id": "abc123",
  "model": "deepseek-v3-0324",
  "choices": [
    {
      "message": { "role": "assistant", "content": "Hello! How can I help?" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 4, "completion_tokens": 9, "total_tokens": 13 }
}
```

**`chat models --output json`:**

```json
{ "models": ["deepseek-v3-0324", "deepseek-r1", "claude-sonnet-4-6", "..."] }
```

---

### config show / config set

```bash
sac config show --output json
sac config set --key default_chat_model --value deepseek-v3-0324
sac config set --key output --value json
sac config set --key timeout --value 600
```

**Valid keys:** `api_key`, `output`, `timeout`, `default_image_model`, `default_chat_model`, `base_url`

**`config show --output json`:**

```json
{
  "base_url": null,
  "output": "json",
  "timeout": 300,
  "config_file": "/Users/you/.sac/config.json",
  "api_key": "sa-a...xxxx",
  "default_chat_model": "deepseek-v3-0324"
}
```

---

## Async Task Flow

```bash
# Submit and capture task ID
RESULT=$(sac generate image --prompt "a cat" --async --quiet --output json)
TASK_ID=$(echo "$RESULT" | node -e "process.stdin.setEncoding('utf8'); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).task_id))")

# Poll until complete
sac generate task "$TASK_ID" --output json
```

Or download directly after polling:

```bash
sac generate image --prompt "a cat" --out-dir ./output --output json
# returns: { "task_id": "...", "saved": ["./output/image_001.webp"] }
```

## Piping Patterns

```bash
# Extract first URL
sac generate image --prompt "a cat" --quiet --output json \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.urls[0])"

# Pipe stdin as messages
echo '[{"role":"user","content":"hello"}]' | sac chat --messages-file - --quiet --output json

# Get first model matching filter
sac chat models --filter deepseek --output json --quiet \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.models[0])"
```

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | General error |
| 2 | Usage / missing required flag |
| 3 | Authentication failed |
| 4 | Quota exceeded |
| 5 | Timeout |
| 6 | Network error |
| 10 | Content filtered |
| 130 | Interrupted (Ctrl+C) |

## Configuration Precedence

```
--api-key flag  >  SAC_API_KEY env  >  ~/.sac/config.json  >  (error)
--base-url flag >  SAC_BASE_URL env  >  config file  >  not configured
--output flag   >  SAC_OUTPUT env   >  config file         >  auto-detect
--timeout flag  >  SAC_TIMEOUT env  >  config file         >  300s
```

## Network Proxy

Node.js `fetch` (Node 18+) requires **uppercase** proxy variables:

```bash
HTTPS_PROXY=http://proxy.example.com:8080 HTTP_PROXY=http://proxy.example.com:8080 sac generate image --prompt "..."
```

Lowercase `https_proxy` is ignored by Node.js `fetch`.
