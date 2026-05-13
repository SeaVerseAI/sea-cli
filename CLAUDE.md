# SAC — SeaArt CLI 开发注意事项

## 项目概述

`sac` 是 SeaArt AI 平台的命令行工具，对接两条网关：
- **多模态网关**：由 `SAC_BASE_URL` 或 `~/.sac/config.json` 的 `base_url` 派生为 `/model`
- **LLM 网关**：由 `SAC_BASE_URL` 或 `~/.sac/config.json` 的 `base_url` 派生为 `/llm`

认证：统一使用 `Authorization: Bearer <token>`，无其他认证方式。

---

## 构建 & 检查

```bash
npm run build        # 构建 dist/sac.mjs（会打印包大小）
npm run lint         # ESLint 静态检查（src/ test/ build.ts）
npm run typecheck    # TypeScript 类型检查（不输出文件）
npm test             # 编译并运行完整测试
```

- 运行时：Node.js ≥ 18
- 产物：`dist/sac.mjs`（单文件 bundle，带 shebang `#!/usr/bin/env node`）
- 本地开发：`npm install && npm run build && npm link`
- 发布：npm 是主要分发渠道，公开 GitHub 仓库只提供源码与文档
- 版本号通过 `process.env.CLI_VERSION` 注入，来源是 `package.json` 的 `version` 字段

### 提交前检查清单

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

四项全绿才提交。

---

## 目录结构

```
src/
  main.ts              # 入口：argv 解析、auth 检查、分发命令
  command.ts           # Command 接口、defineCommand、GLOBAL_OPTIONS
  registry.ts          # 命令注册表 + help 渲染（含 ASCII logo）
  args.ts              # flag 解析器（自研，非第三方库）
  config/
    schema.ts          # Config / ConfigFile 接口、网关常量、parseConfigFile
    loader.ts          # loadConfig()：flag > env > 配置文件 > 默认值
    paths.ts           # ~/.sac/config.json 路径
  client/
    http.ts            # request() / requestJson()，统一注入 Bearer token
    endpoints.ts       # 所有 API 端点 URL 的集中定义
    stream.ts          # SSE 解析器（async generator）
  errors/
    base.ts            # CLIError（携带 exitCode + hint）
    codes.ts           # ExitCode 枚举
    handler.ts         # handleError()：顶层错误格式化 + exit
  output/
    formatter.ts       # detectOutputFormat() + formatOutput()
    json.ts / text.ts  # 具体格式化实现
    progress.ts        # createSpinner()（仅 TTY）
  polling/
    poll.ts            # pollTask()：轮询生成任务状态
  files/
    download.ts        # downloadFile()：流式下载图片
  utils/
    env.ts             # isInteractive()
    prompt.ts          # promptText() / promptConfirm() / failIfMissing()
    token.ts           # maskToken()（日志脱敏）
  types/
    flags.ts           # GlobalFlags 接口
  commands/
    auth/              # login / status / logout
    generate/          # image / task
    chat/              # index（对话）/ models（列出模型）/ set-model（设默认）
    config/            # show / set
```

---

## 命令注册

所有命令在 `src/registry.ts` 注册，路径即命令名（空格分隔）：

```typescript
export const registry = new CommandRegistry({
  'auth login':     authLogin,
  'chat':           chat,
  'chat models':    chatModels,
  'chat set-model': chatSetModel,
  // ...
});
```

**新增命令时必须做三件事：**
1. 在 `registry.ts` 顶部 import
2. 在 `new CommandRegistry({...})` 里注册
3. 在 `printRootHelp()` 的 help 文本里加一行描述

如果命令不需要 API Key（如 `config show`），还要加入 `main.ts` 的 `NO_AUTH_SETUP` 数组。

---

## flag 解析器（args.ts）

自研，不依赖第三方。规则：

- `--flag`（无 `<value>`）→ boolean
- `--flag <value>` 或 `--flag=value` → string
- `type: 'number'` → 自动 `Number(value)`
- `type: 'array'` → 每次出现追加到数组，支持 `--message "a" --message "b"`
- `OptionDef.type` 字段决定解析方式，**不写 type 且 flag 含 `<>` 时默认 string**

flag 名称规则：`--some-flag` → camelCase `someFlag`（`kebabToCamel` 转换）。

**已知限制：** 短参数（`-x`）只跳过，不解析值；positional 参数通过 `flags._positional` 传递。

---

## 配置系统

优先级（高到低）：命令行 flag → 环境变量 → `~/.sac/config.json` → 默认值

| 功能 | 环境变量 | 配置文件字段 |
|---|---|---|
| API Key | `SAC_API_KEY` | `api_key` |
| 输出格式 | `SAC_OUTPUT` | `output` |
| 超时 | `SAC_TIMEOUT` | `timeout` |
| 默认图像模型 | — | `default_image_model` |
| 默认 Chat 模型 | — | `default_chat_model` |
| 网关根地址 | `SAC_BASE_URL` | `base_url` |

`~/.sac/config.json` 权限 600，写入时先写 `.tmp` 再 rename（原子操作）。

---

## 多模态 API（图像生成）

### 模型发现规则

- `generate image` / `generate video` / `generate audio` / `generate 3d` 是本地内置模型的快捷封装，不等于完整模型目录。
- 新增模型、网关已有但 sac 未内置的模型、或任何不确定参数的模型，必须走 `sac model search` -> `sac model get <model-id>` -> `sac generate submit --body-json ...`。
- 不要通过猜测模型名、字段名、flag 名来调用未内置模型。`model get` 返回的 Body Template 和 Fields 是这类模型的唯一调用契约。
- `--list-models` 只用于查看本地快捷封装；排查“为什么模型不认识”时，优先提示用户用 `sac model search --query <name> --output json`。

### 端点
- 创建任务：`POST /model/v1/generation`
- 查询任务：`GET /model/v1/generation/task/{id}`

### 请求体结构
```json
{
  "model": "sdxl",
  "dash_scope": true,
  "moderation": true,
  "input": [{
    "params": {
      "prompt": "...",
      "n_iter": 1,
      "action": 0,
      "model_ver_no": "c9090ffbe5649de2f34cfe5b865d50fe"
    }
  }],
  "metadata": {}
}
```

### 关键注意事项

**`model_ver_no` 是必填字段**，API 文档未说明枚举值。缺少时报 400 `"no model_ver_no found in request"`。已知的版本 ID 在 `src/commands/generate/providers/seaart.ts` 的 `DEFAULT_MODEL_VER` map 中维护：

```typescript
export const DEFAULT_MODEL_VER: Partial<Record<string, string>> = {
  sdxl:          'c9090ffbe5649de2f34cfe5b865d50fe',
  z_image:       'c9090ffbe5649de2f34cfe5b865d50fe',
  z_image_turbo: 'c9090ffbe5649de2f34cfe5b865d50fe',
};
```

用户可通过 `--model-ver-no` 手动指定版本 ID。**每次验证一个新模型，都要把版本 ID 加入这个 map。**

**`action` 字段含义：**
- `0` = text-to-image
- `1` = image-to-image（需同时传 `input[].content[{type:"image", url:...}]`）
- `3` = t2i + controlnet
- `5` = i2i + controlnet

**任务状态轮询（`poll.ts`）：** 间隔 3 秒，超时取 `config.timeout`（默认 300s）。状态字段为小写字符串：`in_progress` / `completed` / `failed`。`progress` 字段范围 0~1。

**图片 URL 路径：** `response.output[].content[].url`

### 支持的模型
- **SeaArt**（dash_scope 格式）：`sdxl`（默认）、`z_image`、`z_image_turbo`
- **Volces**：`volces_seedream_5`、`volces_seedream_4_5`、`volces_jimeng_3_1`、`volces_jimeng_3_0`、`volces_seededit_3_0`、`volces_jimeng_i2i_3_0`
- **Alibaba**：`alibaba_wan27_image_pro`
- **Nano**：`nano_banana_2`

默认模型：`sdxl`

---

## 多模态 API（视频生成）

### 端点
与图像生成相同：`POST /model/v1/generation` / `GET /model/v1/generation/task/{id}`

### 请求体结构（Volces / Vidu / Kling — flat params）

```json
{
  "model": "vidu_q3_pro",
  "dash_scope": true,
  "moderation": true,
  "input": [{ "params": { "prompt": "..." } }],
  "metadata": {}
}
```

### 请求体结构（Alibaba Wanx — 两层结构）

网关规则：`input[0].params.input` → 上游 `input`，`input[0].params.parameters` → 上游 `parameters`

```json
{
  "model": "alibaba_wanx26_t2v",
  "moderation": true,
  "input": [{
    "params": {
      "input": { "prompt": "..." },
      "parameters": { "duration": 5 }
    }
  }],
  "metadata": {}
}
```

注意：Alibaba 模型**不加** `dash_scope: true`。

### 支持的模型

| 模型 | 类型 | 必填 flag | 可选 flag |
|---|---|---|---|
| `vidu_q3_pro` | T2V | `--prompt` | `--duration`, `--aspect-ratio`, `--resolution` |
| `vidu_q3_pro_i2v` | I2V | `--prompt`, `--image-url` | `--duration`, `--resolution` |
| `vidu_q3_reference` | Reference | `--prompt`, `--image-urls` | `--duration`, `--resolution` |
| `kling_v3` | T2V | `--prompt` | `--duration`, `--aspect-ratio` |
| `kling_v3_i2v` | I2V | `--prompt`, `--image-url` | `--duration` |
| `alibaba_wanx26_t2v` | T2V | `--prompt` | `--duration`, `--size`, `--shot-type`, `--seed`, `--audio`, `--audio-url` |
| `alibaba_wanx26_i2v` | I2V | `--image-url` | `--prompt`, `--resolution`（`720P`/`1080P`）, `--duration`, `--seed`, `--audio`, `--audio-url` |
| `alibaba_wanx26_reference` | Reference | `--prompt`, `--reference-urls` | `--duration`, `--size`, `--seed`, `--audio`, `--audio-url` |

**重要**：`alibaba_wanx26_reference` 的 `reference_urls` 在提交时同步校验并下载，URL 必须从中国境内服务器可访问（避免使用 Google Cloud Storage CDN 等被屏蔽的服务）。

---

## 多模态 API（音频生成）

### 支持的模型

| 模型 | 必填 flag | 可选 flag |
|---|---|---|
| `lyria_3_pro_preview` | `--prompt` | — |
| `mureka_song_generator` | `--lyrics` | `--prompt`, `--mureka-model`, `--n`, `--reference-id`, `--vocal-id`, `--melody-id` |

### 请求体结构（lyria）

```json
{
  "model": "lyria_3_pro_preview",
  "dash_scope": true,
  "moderation": true,
  "input": [{ "params": { "input": "epic orchestral theme" } }],
  "metadata": {}
}
```

### 请求体结构（mureka）

```json
{
  "model": "mureka_song_generator",
  "dash_scope": true,
  "moderation": true,
  "input": [{ "params": { "lyrics": "...", "prompt": "..." } }],
  "metadata": {}
}

---

## LLM API（对话）

### 端点
- 对话：`POST /llm/v1/chat/completions`
- 列出模型：`GET /llm/v1/models`

标准 OpenAI 兼容格式，支持流式（`stream: true`）和非流式。

**默认模型：`deepseek-v3-0324`**（在 `src/commands/chat/index.ts` 的 `DEFAULT_CHAT_MODEL` 常量定义）

持久化默认模型：`sac chat set-model --model <id>`，写入 `~/.sac/config.json` 的 `default_chat_model`。

流式模式下用 `src/client/stream.ts` 的 `parseSSE()` 逐 token 输出，`[DONE]` 信号终止。

---

## 输出格式

- TTY 环境 → `text` 格式（人类友好）
- 管道 / 非 TTY → `json` 格式（机器友好；前提是该命令支持结构化 JSON）
- 可通过 `--output json/text` 或 `SAC_OUTPUT` 强制覆盖
- 对于流式输出或原始行输出这类天然不适合 JSON 的模式，必须在命令层直接拒绝 `--output json`，不能静默忽略或偷偷降级

错误信息统一写 stderr，`handleError()` 根据当前 format 输出纯文本或 JSON 结构体。

---

## 错误体系

```
CLIError(message, exitCode, hint?)
  .toJSON() → { error: { code, message, hint? } }
```

| ExitCode | 值 | 含义 |
|---|---|---|
| SUCCESS | 0 | 正常 |
| GENERAL | 1 | 通用错误 |
| USAGE | 2 | 参数错误 |
| AUTH | 3 | 认证失败 |
| QUOTA | 4 | 配额超限 |
| TIMEOUT | 5 | 超时 |
| NETWORK | 6 | 网络错误 |
| CONTENT_FILTER | 10 | 内容过滤 |

所有 API 错误在 `src/errors/api.ts` 的 `mapApiError()` 统一映射。HTTP 4xx/5xx 时，错误消息里会附上请求 URL，方便调试。

---

## 网络代理

本地调试必须走代理。Node.js `fetch`（Node 18+）识别**大写**环境变量：

```bash
HTTPS_PROXY=http://proxy.example.com:8080 HTTP_PROXY=http://proxy.example.com:8080 sac <command>
```

注意：`https_proxy`（小写）对 Node.js `fetch` **无效**，但对 curl 有效。

---

## 交互式提示

- `promptText()` / `promptConfirm()` 封装在 `src/utils/prompt.ts`，底层用 `@clack/prompts`
- 所有命令统一调用这两个工具函数，**不要直接 import `@clack/prompts`**
- `failIfMissing(flagName, context)` 用于非交互模式下必填参数缺失时抛出 `CLIError`
- `isInteractive()` 检查是否 TTY + 非 `--non-interactive` 模式

---

## 新增命令 checklist

1. 在 `src/commands/<category>/` 下新建文件，用 `defineCommand()` 定义
2. `src/registry.ts`：import + 注册 + help 文本加一行
3. 如果不需要 auth：加入 `main.ts` 的 `NO_AUTH_SETUP`
4. 如果有新端点：先加到 `src/client/endpoints.ts`，不要在命令文件里硬编码 URL
5. 错误一律用 `CLIError`，不要 `throw new Error()`
6. 构建验证：`npm run build`，然后用代理做端到端测试

---

## 版本管理

版本号遵循 **Semantic Versioning**：`MAJOR.MINOR.PATCH`

| 变更类型 | 版本号 | 示例 |
|---|---|---|
| 新增命令/flag（完全向后兼容） | MINOR 递增 | `0.1.0` → `0.2.0` |
| Bug 修复、文档、内部重构 | PATCH 递增 | `0.1.0` → `0.1.1` |
| 破坏性变更（删除命令/flag、修改输出结构） | MAJOR 递增 | `0.1.0` → `1.0.0` |

`sac --version` 只打印当前版本，不做远端检查。`sac update` 只输出更新指引，不下载或替换本机文件。npm 安装用 `npm install -g sac-cli@latest`，源码安装用 `git pull && npm install && npm run build`。

---

## 发布流程（必须严格按顺序执行）

> **tag 和 `package.json` 版本号必须一致。** npm 发布产物 `dist/sac.mjs` 在本地构建时由 `package.json` 注入版本号。`dist/` 不进 Git，但发布 npm 前必须重新构建。

```bash
# 1. 修改 package.json 里的 version 字段（如 0.3.1 → 0.4.0）
vim package.json

# 2. 本地重新构建，将新版本号注入 npm 发布产物
npm run build

# 3. 提交源码/文档/元数据，不提交 dist/
git add package.json package-lock.json src test README.md AGENTS.md CLAUDE.md skill .gitignore LICENSE
git commit -m "chore: release 0.4.0"

# 4. 推送 commit
git push

# 5. 打 tag（与 package.json version 完全一致，加 v 前缀）
git tag v0.4.0
git push origin v0.4.0

# 6. 发布 npm 包
npm publish --access public

```

**绝对不能这样做：**
- 先打 tag 再改版本号（tag 指向的 commit 里版本号还是旧的）
- 发布 npm 前不重新构建（bundle 里版本号不会更新）
- tag 名和 `package.json` version 不一致（如 tag `v0.4.0` 但 version 是 `0.3.1`）

---

## 前向兼容性要求（强制）

**任何新特性开发都必须保持前向兼容性。** Agent 依赖 `sac` 的输出格式和 flag 接口运行，破坏性变更会导致 Agent 静默出错。

### 绝对禁止（需要 MAJOR 版本才能做）

- **删除**已有命令、子命令、flag
- **重命名**已有命令、子命令、flag
- **修改** `--output json` 模式下已有字段的 key 名称
- **修改**已有字段的数据类型（如 string → number）
- **修改** exit code 的含义

### 允许的变更（MINOR/PATCH）

- 新增命令或子命令
- 新增可选 flag（已有命令行为不变）
- 在 JSON 输出中**新增**字段（不修改、不删除已有字段）
- 修复 bug（前提是不改变正常路径的输出格式）
- 优化错误消息文本（exit code 不变）

### 实操检查清单

改动前问自己：
- [ ] 这个改动会让现有的 `--output json` 解析脚本报错吗？
- [ ] Agent 用 `$?` 检查 exit code 的逻辑会受影响吗？
- [ ] 任何已有的 flag 或命令路径被删除或重命名了吗？

如果任意一项为 **是**，必须升 MAJOR 版本，并在 commit message 里注明 `BREAKING CHANGE:`。
