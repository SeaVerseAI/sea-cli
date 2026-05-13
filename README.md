# sac — SeaArt CLI

Command-line tool for the SeaArt AI platform. `sac` is short for SeaArt CLI. Generate images, chat with LLMs, and manage tasks from the terminal or from an AI agent.

## For AI Agents

If you are an AI agent and have been given this repository URL, follow these steps before doing anything else:

**Step 1 — Install the CLI:**

```bash
npm install -g sac-cli@latest
```

**Step 2 — Read the skill guide** (`skill/SKILL.md` in this repo). It contains the complete command reference, flag tables, expected stdout formats, exit codes, and piping patterns you need to use `sac` correctly in non-interactive contexts.

**Step 3 — Verify:**

```bash
sac --version
sac auth status
```

**Step 4 — Use this baseline for agent-safe commands that support structured JSON output:**

```bash
sac --non-interactive --quiet --output json <command> [flags]
```

Some command modes are intentionally text-only and reject `--output json` with a usage error, including `chat --stream`, interactive `chat`, `generate task --output-only-url`, and `update`.

---

## Installation

Install from npm:

```bash
npm install -g sac-cli@latest
```

Verify:

```bash
sac --version
```

Install from source for development:

```bash
npm install
npm run build
npm link
```

Upgrade paths:

- npm install: `npm install -g sac-cli@latest`
- source checkout: `git pull && npm install && npm run build`

## Distribution

The npm package is the canonical install path. It publishes only the runnable bundle and minimal metadata: `dist/sac.mjs`, `package.json`, `README.md`, and `LICENSE`.

The public GitHub repository provides source code, issues, and documentation. Do not commit generated test output, local archives, or packaged tarballs.

`sac update` is informational only and prints the correct update command for npm or source checkouts. It no longer downloads or replaces local binaries.

## Authentication

```bash
sac auth login --api-key sa-xxxxxxxx --base-url https://gateway.example.com
sac auth status --check
```

Or use environment variables (take precedence over config file):

```bash
export SAC_API_KEY=sa-xxxxxxxx
export SAC_BASE_URL=https://gateway.example.com
sac auth status --check
```

`sac auth login` validates the key against the API before saving it. `sac auth status --check` performs the same validation without mutating config.

## Quick Start

```bash
# Generate an image
sac generate image --prompt "a cat in space"

# Chat with an LLM
sac chat --message "Hello"

# List available LLM models
sac chat models
```

## Commands

### auth

```bash
sac auth login --api-key <token>   # Validate and save API key to ~/.sac/config.json
sac auth status                    # Show current auth state
sac auth status --check            # Verify the current API key against the API
sac auth logout                    # Remove stored API key
```

`auth login`, `auth status`, and `auth logout` support `--output json`.

### generate image

```bash
sac generate image --prompt "text"                      # Generate with built-in default model (volces_seedream_4_5)
sac generate image --prompt "text" --model z_image --image-url https://example.com/img.webp
sac generate image --prompt "product hero shot" --model kling_v3_image --aspect-ratio 1:1
sac generate image --prompt "国风山水画" --model tencent_image_creation_3 --resolution 1024:1024 --logo-add 1 --revise 1
sac generate image --prompt "text" --n 2               # Generate 2 images
sac generate image --prompt "text" --width 1024 --height 1024
sac generate image --prompt "text" --out-dir ./output  # Download to disk
sac generate image --prompt "text" --async             # Return task ID immediately
sac generate image --list-models                       # List all available models
sac generate image --list-models --provider volces     # Filter by provider
```

Built-in default model: `volces_seedream_4_5`. If `default_image_model` is configured, the config value takes precedence.

**SeaArt models** (`--model <id>`): `sdxl`, `z_image`, `z_image_turbo`

**Volces models**: `volces_seedream_5`, `volces_seedream_4_5`, `volces_seedream_4_0`, `volces_seedream_3_0`, `volces_seedream_4_5_multi_blend`, `volces_jimeng_3_1`, `volces_jimeng_3_0`, `volces_jimeng_i2i_3_0`, `volces_jimeng_tilesr`, `volces_seededit_3_0`, `volces_seededit_3_0_i2i`, `volces_seededit_single_ip`, `volces_seededit_multi_ip`, `volces_seededit_multi_style`, `volces_seededit_3d_style`, `volces_seededit_portrait`

**Alibaba models**: `alibaba_wan27_image_pro`

**Nano models**: `nano_banana_2`

**Kling models**: `kling_v3_image`, `kling_omni_image`, `kling_v3_omni_image`

**Tencent models**: `tencent_image_creation_3` (text-to-image; supports `--resolution`, `--seed`, `--logo-add 0|1`, `--revise 0|1`)

### generate video

```bash
sac generate video [--model <id>] [--prompt "text"]    # Built-in default: volces_seedance_1_5_pro
sac generate video --prompt "text" --model vidu_q3_pro --async
sac generate video --prompt "text" --model kling_v3 --aspect-ratio 16:9
# Image-to-video (requires --image-url)
sac generate video --prompt "car drives away" --model kling_v3_i2v --image-url https://example.com/img.webp
# Kling avatar
sac generate video --model kling_avatar --image-url https://example.com/avatar.png --audio-url https://example.com/voice.mp3
# Kling motion control
sac generate video --model kling_motion_control --image-url https://example.com/actor.png --video-url https://example.com/ref.mp4 --character-orientation image --mode std
# Kling Omni video
sac generate video --prompt "a toy robot waves to camera" --model kling_omni_video --aspect-ratio 16:9
# Kling lipsync
sac generate video --prompt "你好，欢迎来到 SeaArt" --model kling_lipsync --lipsync-mode text2video --video-url https://example.com/face.mp4 --voice-id voice_123 --voice-language zh
# Tencent video super-resolution
sac generate video --model tencent_mps_super_resolution --video-url https://example.com/input.mp4 --resolution 1080P --short 1
# Reference video (requires --image-urls)
sac generate video --prompt "cinematic shot" --model vidu_q3_reference --image-urls https://example.com/img.webp
# Alibaba reference video (reference_urls must be publicly accessible from China)
sac generate video --prompt "commercial" --model alibaba_wanx26_reference --reference-urls https://example.com/img.jpg
# Volces SeeDance text-to-video
sac generate video --prompt "a fox in snow" --model volces_seedance_3_0 --resolution 720p
# Volces image-to-video
sac generate video --model volces_seedance_30_i2v --image-url https://example.com/first.jpg --prompt "slow camera push"
# Volces actor / avatar video
sac generate video --model volces_jimeng_dream_actor_m2 --image-url https://example.com/actor.png --video-url https://example.com/template.mp4
sac generate video --model volces_realman_avatar_picture_omni_v15 --image-url https://example.com/avatar.png --audio-url https://example.com/voice.mp3
# MiniMax text-to-video / image-to-video
sac generate video --prompt "cinematic city at night" --model minimax_hailuo_02 --duration 10 --resolution 768P --prompt-optimizer false
sac generate video --model minimax_hailuo_23_fast_i2v --image-url https://example.com/first.jpg --prompt "gentle push in" --resolution 768P
```

**Vidu models**: `vidu_q3_pro` (t2v), `vidu_q3_pro_i2v` (i2v, requires `--image-url`), `vidu_q3_reference` (reference, requires `--image-urls`)

**Kling models**:
- T2V: `kling_v1`, `kling_v1_5`, `kling_v1_6`, `kling_v2_master`, `kling_v2_1_master`, `kling_v2_5_turbo`, `kling_v2_6`, `kling_v3`
- I2V: `kling_v1_i2v`, `kling_v1_5_i2v`, `kling_v1_6_i2v`, `kling_v2_1_i2v`, `kling_v2_master_i2v`, `kling_v2_1_master_i2v`, `kling_v2_5_turbo_i2v`, `kling_v2_6_i2v`, `kling_v3_i2v`
- Avatar: `kling_avatar` (requires `--image-url` and one of `--audio-id` / `--audio-url`)
- Motion control: `kling_motion_control`, `kling_v3_motion_control` (require `--image-url`, `--video-url`, `--character-orientation`, `--mode`)
- Effects: `kling_effects_single` (requires `--image-url`, `--effect-scene`, `--duration`), `kling_effects_multi_v1`, `kling_effects_multi_v15`, `kling_effects_multi_v16` (require exactly 2 images plus `--effect-scene` and `--duration`)
- Utility: `kling_duration_extension` (requires `--video-url` and `--duration`)
- Lipsync: `kling_lipsync` (requires `--lipsync-mode`; use `text2video` with `--prompt`, `--video-url`/`--video-id`, `--voice-id`, `--voice-language`; or `audio2video` with `--audio-url`)
- Omni: `kling_omni_video`, `kling_v3_omni_video` (prompt-driven multi-modal video; current CLI supports prompt, image refs, video ref, aspect ratio, duration, and v3 sound switch)

**Tencent video models**: `tencent_kling_v3`, `tencent_kling_v3_omni`, `tencent_mps_super_resolution` (`--video-url`, `--resolution 720P|1080P|2K|4K`, optional `--short 0|1`)

**Alibaba Wanx models**: `alibaba_wanx26_t2v` (t2v), `alibaba_wanx26_i2v` (i2v, requires `--image-url`, supports `--resolution 720P/1080P`), `alibaba_wanx26_reference` (reference, requires `--reference-urls`)

**MiniMax video models**:
- T2V: `minimax_t2v_01`, `minimax_t2v_01_director`, `minimax_hailuo_02`
- I2V: `minimax_i2v_01_live`, `minimax_i2v_01`, `minimax_i2v_01_director`, `minimax_hailuo_02_i2v`, `minimax_hailuo_23_fast_i2v`, `minimax_hailuo_23_i2v`
- Key constraints: `minimax_t2v_01*` and `minimax_i2v_01*` are fixed at `6s` and `720P`; `minimax_hailuo_*` supports `--prompt-optimizer <true|false>`, optional `--fast-pretreatment`, and `10s` only on `768P`

**Volces models**:
- `volces_seedance_1_5_pro`, `volces_seedance_2_0`, `volces_seedance_2_0_fast`, `volces_seedance_3_0`, `volces_seedance_3_0_pro`, `volces_seedance_30_i2v`, `volces_seedance_pro_fast`
- `volces_draft_video`
- `volces_jimeng_dream_actor_m1`, `volces_jimeng_dream_actor_m2`
- `volces_realman_avatar_picture_omni_v2`, `volces_realman_avatar_picture_omni_v15`, `volces_realman_avatar_imitator_v2v`

Volces prompt rules depend on the model. `volces_seedance_3_0` requires `--prompt`; actor/avatar and draft models usually require media input instead.

Built-in default model: `volces_seedance_1_5_pro`.

Key flags for video: `--duration <s>`, `--size <WxH>`, `--aspect-ratio <ratio>`, `--resolution <preset>`, `--seed <n>`, `--fps <n>`, `--frames <n>`, `--image-url <url>`, `--image-tail-url <url>`, `--image-urls <url>`, `--video-url <url>`, `--video-id <id>`, `--audio-url <url>`, `--audio-id <id>`, `--voice-id <id>`, `--voice-language <lang>`, `--voice-speed <n>`, `--lipsync-mode <mode>`, `--element-ids <id>`, `--video-refer-type <type>`, `--effect-scene <scene>`, `--character-orientation <image|video>`, `--keep-original-sound <yes|no>`, `--extension-type <type>`, `--service-tier <tier>`, `--draft-task-id <id>`, `--mask-urls <url>`, `--audio` (enable AI audio), `--shot-type <type>` (Wanx t2v only)

### generate audio

```bash
sac generate audio [--model <id>] --prompt "text"      # Built-in default: lyria_3_pro_preview
sac generate audio --prompt "epic orchestral theme" --model lyria_3_pro_preview
sac generate audio --prompt "pop anthem" --model mureka_song_generator --lyrics "verse1..."
sac generate audio --model kling_video_to_audio --video-url https://example.com/clip.mp4 --sound-effect-prompt "rain and city ambience"
sac generate audio --prompt "indie folk, wistful, warm guitar" --model minimax_music_25_plus --instrumental --format wav
sac generate audio --prompt "你好，这是一段旁白" --model minimax_t2a --voice-id female-chengshu --voice-speed 1.1 --output-format url
```

Built-in default model: `lyria_3_pro_preview`.

**Models**:
- `lyria_3_pro_preview` — music generation from prompt
- `mureka_song_generator` — song with lyrics, requires `--lyrics`
- `kling_video_to_audio` — video-to-audio, requires `--video-url` or `--video-id`
- `minimax_music_25`, `minimax_music_25_plus` — MiniMax music generation with optional `--lyrics`, `--lyrics-optimizer`, `--sample-rate`, `--bitrate`, `--format`; `--instrumental` is only supported by `minimax_music_25_plus`
- `minimax_music_generation` — MiniMax music generation with required internal variant via `--minimax-model` (`music-2.6`, `music-cover`, `music-2.6-free`, `music-cover-free`)
- `minimax_t2a` — MiniMax text-to-speech with optional `--minimax-model`, `--voice-id`, `--voice-speed`, `--voice-volume`, `--voice-pitch`, `--voice-emotion`, `--sample-rate`, `--bitrate`, `--format`, `--channel`, `--output-format`

### generate 3d

```bash
sac generate 3d --prompt "a stylized toy robot"        # Built-in default: tripo3d_text_to_model
sac generate 3d --image-url https://example.com/object.png  # Built-in default: tripo3d_image_to_model
sac generate 3d --image-urls https://example.com/front.png --image-urls https://example.com/left.png --image-urls https://example.com/back.png --image-urls https://example.com/right.png --texture 0 --pbr 0  # Built-in default: tripo3d_multiview_to_model
sac generate 3d --model volces_seed3d --prompt "a stylized ceramic cat figurine" --image-url https://example.com/cat.png
sac generate 3d --model tencent_hunyuan_3d --prompt "a carved jade dragon" --result-format GLB --enable-pbr
sac generate 3d --model tencent_hunyuan_3d_pro --image-url https://example.com/object.png --face-count 80000 --generate-type LowPoly --polygon-type triangle
sac generate 3d --list-models
```

Built-in defaults only apply to unambiguous Tripo3D flows: prompt-only => `tripo3d_text_to_model`, single `--image-url` => `tripo3d_image_to_model`, repeated `--image-urls` => `tripo3d_multiview_to_model`. Mixed or Tencent-style inputs still require explicit `--model`.

**Volces models**: `volces_seed3d` (image + prompt to 3D, requires `--prompt` and `--image-url`)

**Tencent models**:
- `tencent_hunyuan_3d` (requires exactly one of `--prompt` / `--image-url` / `--image-base64`; supports `--result-format`, `--enable-pbr`, repeated `--multi-view-image left=<url|base64:data>`)
- `tencent_hunyuan_3d_pro` (requires exactly one of `--prompt` / `--image-url` / `--image-base64`; supports `--face-count`, `--generate-type`, `--polygon-type`, `--enable-pbr`, repeated raw `--multi-view-image <url>`)
- `tencent_hunyuan_3d_rapid` (requires exactly one of `--prompt` / `--image-url` / `--image-base64`; supports `--result-format`, `--enable-pbr`)

### generate task

```bash
sac generate task <task-id>                  # Query task status
sac generate task <task-id> --output json    # JSON output
sac generate task <task-id> --output-only-url  # Raw URL lines (text only)
```

### chat

```bash
sac chat                                            # Interactive REPL (human use, TTY only)
sac chat --message "Hello"                          # Single-turn (default model: deepseek-v3-0324)
sac chat --model gemini-2.5-pro --message "Hello"   # Specific model
sac chat --message "user:Hi" --message "assistant:Hello" --message "How are you?"
sac chat --system "You are a helpful assistant" --message "Explain recursion"
sac chat --message "Hello" --stream                 # Force streaming
sac chat --messages-file messages.json              # Load from file
sac chat models                                     # List available models
sac chat models --output json                       # Structured model list
sac chat models --filter claude                     # Filter by substring
sac chat set-model --model deepseek-v3-0324         # Set default model
sac chat set-model --model deepseek-v3-0324 --output json
```

> **Note for agents/automation:** Always pass `--message` and `--non-interactive`. Running `sac chat` without `--message` in a non-TTY context exits with an error. Running it in a TTY without `--message` starts an interactive REPL that blocks on keyboard input — not suitable for automation.

`--output json` is only supported for non-streaming single-turn chat. `sac chat --stream --output json` and interactive REPL with `--output json` are rejected with a usage error.

### config

```bash
sac config show                                     # Show current config
sac config set --key default_chat_model --value deepseek-v3-0324
sac config set --key default_chat_model --value deepseek-v3-0324 --output json
sac config set --key output --value json
sac config set --key timeout --value 600
```

## Global Flags

| Flag | Description |
|---|---|
| `--api-key <token>` | Temporary bearer token for this command only. Exception: `sac auth login --api-key ...` validates and saves it to config |
| `--base-url <url>` | Temporary gateway base URL for this command only. Exception: `sac auth login --base-url ...` validates and saves it to config. `https://host` expands to `/model` and `/llm`; `.../model` and `.../llm` are also accepted |
| `--output json\|text` | Output format (default: auto-detect by TTY) |
| `--timeout <seconds>` | Request timeout (default: 300) |
| `--quiet` | Suppress spinners and info messages |
| `--verbose` | Print HTTP request/response details |
| `--dry-run` | Show what would happen without executing |
| `--non-interactive` | Disable interactive prompts, fail on missing args |
| `--async` | Return task ID immediately without polling |
| `--no-color` | Disable ANSI colors |

Command-specific constraints still apply. For example, `chat --stream`, interactive `chat`, and `generate task --output-only-url` cannot be combined with `--output json`, and `update` only supports text output.

## Output Format

- **TTY**: human-readable text with spinners
- **Pipe / non-TTY**: JSON automatically when the command supports structured JSON output
- Force with `--output json` or `SAC_OUTPUT=json`

Modes that intentionally stream tokens or emit raw line output reject JSON instead of silently changing behavior.

## Environment Variables

| Variable | Description |
|---|---|
| `SAC_API_KEY` | Bearer token |
| `SAC_OUTPUT` | Default output format |
| `SAC_TIMEOUT` | Default timeout in seconds |
| `SAC_VERBOSE` | Enable verbose output (`1`) |
| `SAC_BASE_URL` | Gateway base URL; `/model` and `/llm` are derived |

## Network Proxy

Node.js `fetch` (Node 18+) reads **uppercase** proxy variables:

```bash
HTTPS_PROXY=http://proxy.example.com:8080 sac generate image --prompt "..."
```

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | General error |
| 2 | Usage / bad arguments |
| 3 | Authentication failed |
| 4 | Quota exceeded |
| 5 | Timeout |
| 6 | Network error |
| 10 | Content filtered |

## Config File

Stored at `~/.sac/config.json` (mode 600).

```json
{
  "api_key": "sa-xxx",
  "default_chat_model": "deepseek-v3-0324",
  "output": "json",
  "timeout": 300
}
```
