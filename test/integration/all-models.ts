/**
 * 端到端集成测试 — 覆盖所有注册模型
 *
 * 运行方式：
 *   SAC_API_KEY=sa-xxx node --experimental-strip-types test/integration/all-models.ts
 *
 * 可选环境变量：
 *   HTTPS_PROXY / HTTP_PROXY  — 可选代理（如 http://proxy.example.com:8080）
 *   SAC_BASE_URL              — 网关根地址；脚本会自动派生 /model 和 /llm
 *   TEST_ASYNC=1              — 只验证任务提交，不轮询等待结果（快）
 *   TEST_FILTER=sdxl,z_image — 只跑逗号分隔的模型列表
 *   TEST_TIMEOUT=600          — 单个任务超时秒数（默认 300）
 *
 * 测试图片（科幻汽车）：
 *   https://image.cdn2.seaart.me/2026-04-14/d7er0sle878c73abprc0/203f6f679932b2f814f5af505b79516e_high.webp
 */

// ── 配置区（按需修改） ─────────────────────────────────────────────────────────

const API_KEY    = process.env['SAC_API_KEY'] ?? '';  // 必填：你的 sa-xxx token
const TEST_IMAGE = 'https://image.cdn2.seaart.me/2026-04-14/d7er0sle878c73abprc0/203f6f679932b2f814f5af505b79516e_high.webp';

// ──────────────────────────────────────────────────────────────────────────────

import { loadConfig } from '../../src/config/loader.ts';
import { getProvider } from '../../src/commands/generate/providers/registry.ts';
import { requestJson } from '../../src/client/http.ts';
import { generationEndpoint } from '../../src/client/endpoints.ts';
import { pollTask } from '../../src/polling/poll.ts';

// Configure proxy for Node.js fetch (native fetch ignores HTTPS_PROXY env var)
{
  const proxyUrl = process.env['HTTPS_PROXY'] ?? process.env['HTTP_PROXY'] ?? '';
  if (proxyUrl) {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  }
}

const FILTER_RAW    = process.env['TEST_FILTER'] ?? '';
const FILTER        = FILTER_RAW ? new Set(FILTER_RAW.split(',').map(s => s.trim())) : null;
const TIMEOUT_S     = Number(process.env['TEST_TIMEOUT'] ?? 600);
const CONCURRENCY   = Number(process.env['TEST_CONCURRENCY'] ?? 5);
const GATEWAY_ROOT  = process.env['SAC_BASE_URL'] ?? '';

// ── 测试用例表 ────────────────────────────────────────────────────────────────

interface Case {
  model: string;
  flags: Record<string, unknown>;
  skip?: string;         // 跳过原因
}

const CASES: Case[] = [
  // ── 图像 ──────────────────────────────────────────────────────────────────

  // SeaArt
  { model: 'sdxl',          flags: { prompt: '1girl, cyberpunk city, neon lights' } },
  { model: 'z_image',       flags: { prompt: 'anime girl', imageUrl: TEST_IMAGE } },
  { model: 'z_image_turbo', flags: { prompt: 'anime style', imageUrl: TEST_IMAGE } },

  // Volces
  { model: 'volces_seedream_5',      flags: { prompt: 'sci-fi car, cinematic lighting', size: '2048x2048' } },
  { model: 'volces_seedream_4_5',    flags: { prompt: 'sci-fi car, cinematic lighting', size: '2048x2048' } },
  { model: 'volces_jimeng_3_1',      flags: { prompt: 'futuristic vehicle', width: 1280, height: 720 } },
  { model: 'volces_jimeng_3_0',      flags: { prompt: 'futuristic vehicle', width: 1280, height: 720 } },
  { model: 'volces_seededit_3_0',    flags: { prompt: 'make it cyberpunk', imageUrl: TEST_IMAGE } },
  { model: 'volces_seededit_3_0_i2i', flags: { prompt: 'add neon glow', imageUrl: TEST_IMAGE },        skip: 'model not available (404)' },
  { model: 'volces_jimeng_i2i_3_0',  flags: { prompt: 'anime style', imageUrl: TEST_IMAGE } },

  // Alibaba image
  { model: 'alibaba_wan27_image', flags: { prompt: 'a futuristic car in space, photorealistic' } },
  { model: 'alibaba_wan27_image_pro', flags: { prompt: 'a futuristic car in space, photorealistic' } },

  // Kling image
  { model: 'kling_v3_image',       flags: { prompt: 'a futuristic car in space, photorealistic', aspectRatio: '16:9' } },
  { model: 'kling_omni_image',     flags: { prompt: 'a futuristic car poster, graphic design', aspectRatio: '16:9', imageUrl: TEST_IMAGE } },
  { model: 'kling_v3_omni_image',  flags: { prompt: 'a futuristic car poster, graphic design', aspectRatio: '16:9', imageUrl: TEST_IMAGE } },

  // Nano
  { model: 'nano_banana_2', flags: { prompt: 'sci-fi car, dramatic lighting', aspectRatio: '16:9' } },

  // Tencent image
  { model: 'tencent_image_creation_3', flags: { prompt: '科幻概念跑车海报', resolution: '1024:1024', logoAdd: 1, revise: 1 } },
  // Tripo3D image
  { model: 'tripo3d_text_to_image', flags: { prompt: 'stylized toy car concept art', negativePrompt: 'blurry' } },

  // ── 视频 ──────────────────────────────────────────────────────────────────

  // Vidu T2V
  { model: 'vidu_q3_pro',         flags: { prompt: 'a futuristic car driving through a neon city' } },
  // Vidu I2V
  { model: 'vidu_q3_pro_i2v',     flags: { prompt: 'the car accelerates and drives away', imageUrl: TEST_IMAGE } },
  // Vidu Reference
  { model: 'vidu_q3_reference',   flags: { prompt: 'cinematic shot of the car', imageUrls: [TEST_IMAGE] } },

  // Kling T2V
  { model: 'kling_v1',            flags: { prompt: 'a sci-fi car flying through clouds', aspectRatio: '16:9' } },
  { model: 'kling_v1_5',          flags: { prompt: 'a sci-fi car flying through clouds', aspectRatio: '16:9' } },
  { model: 'kling_v1_6',          flags: { prompt: 'a sci-fi car flying through clouds', aspectRatio: '16:9' } },
  { model: 'kling_v2_master',     flags: { prompt: 'a sci-fi car flying through clouds', aspectRatio: '16:9' } },
  { model: 'kling_v2_1_master',   flags: { prompt: 'a sci-fi car flying through clouds', aspectRatio: '16:9' } },
  { model: 'kling_v2_5_turbo',    flags: { prompt: 'a sci-fi car flying through clouds', aspectRatio: '16:9' } },
  { model: 'kling_v2_6',          flags: { prompt: 'a sci-fi car flying through clouds', aspectRatio: '16:9' } },
  { model: 'kling_v3',            flags: { prompt: 'a sci-fi car flying through clouds', aspectRatio: '16:9' } },
  // Kling I2V
  { model: 'kling_v1_i2v',            flags: { prompt: 'the car drives into the sunset', imageUrl: TEST_IMAGE } },
  { model: 'kling_v1_5_i2v',          flags: { prompt: 'the car drives into the sunset', imageUrl: TEST_IMAGE } },
  { model: 'kling_v1_6_i2v',          flags: { prompt: 'the car drives into the sunset', imageUrl: TEST_IMAGE } },
  { model: 'kling_v2_1_i2v',          flags: { prompt: 'the car drives into the sunset', imageUrl: TEST_IMAGE } },
  { model: 'kling_v2_master_i2v',     flags: { prompt: 'the car drives into the sunset', imageUrl: TEST_IMAGE } },
  { model: 'kling_v2_1_master_i2v',   flags: { prompt: 'the car drives into the sunset', imageUrl: TEST_IMAGE } },
  { model: 'kling_v2_5_turbo_i2v',    flags: { prompt: 'the car drives into the sunset', imageUrl: TEST_IMAGE } },
  { model: 'kling_v2_6_i2v',          flags: { prompt: 'the car drives into the sunset', imageUrl: TEST_IMAGE } },
  { model: 'kling_v3_i2v',            flags: { prompt: 'the car drives into the sunset', imageUrl: TEST_IMAGE } },
  // Kling utility / effects
  { model: 'kling_effects_single',    flags: { imageUrl: TEST_IMAGE, effectScene: 'baseball', duration: 5 } },
  { model: 'kling_effects_multi_v1',  flags: { imageUrls: [TEST_IMAGE, TEST_IMAGE], effectScene: 'hug', duration: 5 } },
  { model: 'kling_effects_multi_v15', flags: { imageUrls: [TEST_IMAGE, TEST_IMAGE], effectScene: 'hug', duration: 5 } },
  { model: 'kling_effects_multi_v16', flags: { imageUrls: [TEST_IMAGE, TEST_IMAGE], effectScene: 'hug', duration: 5 } },
  { model: 'kling_avatar',            flags: { imageUrl: TEST_IMAGE, audioUrl: 'https://example.com/voice.mp3' }, skip: 'needs stable public audio asset' },
  { model: 'kling_motion_control',    flags: { imageUrl: TEST_IMAGE, videoUrl: 'https://example.com/motion.mp4', characterOrientation: 'image', mode: 'std' }, skip: 'needs stable public motion video asset' },
  { model: 'kling_v3_motion_control', flags: { imageUrl: TEST_IMAGE, videoUrl: 'https://example.com/motion.mp4', characterOrientation: 'image', mode: 'std' }, skip: 'needs stable public motion video asset' },
  { model: 'kling_duration_extension', flags: { videoUrl: 'https://example.com/input.mp4', duration: 10 }, skip: 'needs stable public input video asset' },
  { model: 'kling_omni_video',       flags: { prompt: 'a sci-fi car emerges from fog', aspectRatio: '16:9', duration: 5 } },
  { model: 'kling_v3_omni_video',    flags: { prompt: 'a sci-fi car emerges from fog', aspectRatio: '16:9', duration: 5, sound: 'off' } },
  { model: 'kling_lipsync',          flags: { lipsyncMode: 'audio2video', videoUrl: 'https://example.com/face.mp4', audioUrl: 'https://example.com/voice.mp3' }, skip: 'needs stable public face video and audio assets' },
  // Tencent Kling
  { model: 'tencent_kling_v3',       flags: { prompt: 'a sci-fi car emerges from fog', imageUrl: TEST_IMAGE, duration: 5 } },
  { model: 'tencent_kling_v3_omni',  flags: { prompt: 'a sci-fi car emerges from fog', aspectRatio: '16:9', duration: 5 } },
  { model: 'tencent_mps_super_resolution', flags: { videoUrl: 'https://example.com/input.mp4', resolution: '1080P', short: 1 }, skip: 'needs stable public input video asset' },

  // Alibaba video T2V
  { model: 'alibaba_wan27_t2v',  flags: { prompt: 'a futuristic sci-fi race car speeding across Mars', resolution: '1080P', aspectRatio: '16:9' } },
  { model: 'alibaba_wanx26_t2v',  flags: { prompt: 'a futuristic sci-fi race car speeding across Mars' } },
  // Alibaba video I2V
  { model: 'alibaba_wan27_i2v',  flags: { prompt: 'the car starts moving', imageUrl: TEST_IMAGE, resolution: '720P' } },
  { model: 'alibaba_wanx26_i2v',  flags: { prompt: 'the car starts moving', imageUrl: TEST_IMAGE, resolution: '720P' } },
  { model: 'alibaba_wanx26_i2v_flash',  flags: { prompt: 'the car starts moving', imageUrl: TEST_IMAGE, resolution: '720P' } },
  // Alibaba reference (needs publicly accessible URL; Alibaba CDN image for reliable download)
  { model: 'alibaba_wan27_r2v', flags: { prompt: 'sci-fi car cinematic commercial', imageUrls: ['https://cdn.translate.alibaba.com/r/wanx-demo-1.png'], videoUrl: 'https://example.com/ref.mp4' }, skip: 'needs stable public reference video asset' },
  { model: 'alibaba_wanx26_reference', flags: { prompt: 'sci-fi car cinematic commercial', referenceUrls: ['https://cdn.translate.alibaba.com/r/wanx-demo-1.png'] } },
  { model: 'alibaba_wan27_videoedit', flags: { prompt: 'restyle the car video as a retro ad', videoUrl: 'https://example.com/input.mp4', imageUrl: TEST_IMAGE }, skip: 'needs stable public input video asset' },

  // PixVerse video
  { model: 'pixverse_v3_5_t2v', flags: { prompt: 'a sci-fi car emerges from fog', aspectRatio: '16:9', resolution: '720p', duration: 5 } },
  { model: 'pixverse_v4_t2v', flags: { prompt: 'a sci-fi car emerges from fog', aspectRatio: '16:9', resolution: '720p', duration: 5 } },
  { model: 'pixverse_v4_5_t2v', flags: { prompt: 'a sci-fi car emerges from fog', aspectRatio: '16:9', resolution: '720p', duration: 5 } },
  { model: 'pixverse_v5_t2v', flags: { prompt: 'a sci-fi car emerges from fog', aspectRatio: '16:9', resolution: '720p', duration: 5 } },
  { model: 'pixverse_v5_5_t2v', flags: { prompt: 'a sci-fi car emerges from fog', aspectRatio: '16:9', resolution: '720p', duration: 5, audio: true } },
  { model: 'pixverse_v5_6_t2v', flags: { prompt: 'a sci-fi car emerges from fog', aspectRatio: '16:9', resolution: '720p', duration: 5, audio: true, thinkingType: 'auto' } },
  { model: 'pixverse_v6_t2v', flags: { prompt: 'a sci-fi car emerges from fog', aspectRatio: '16:9', resolution: '720p', duration: 5, audio: true, multiShot: true } },
  { model: 'pixverse_v3_5_i2v', flags: { prompt: 'the car accelerates', imageUrl: TEST_IMAGE, resolution: '720p', duration: 5 } },
  { model: 'pixverse_v4_i2v', flags: { prompt: 'the car accelerates', imageUrl: TEST_IMAGE, resolution: '720p', duration: 5 } },
  { model: 'pixverse_v4_5_i2v', flags: { prompt: 'the car accelerates', imageUrl: TEST_IMAGE, resolution: '720p', duration: 5 } },
  { model: 'pixverse_v5_i2v', flags: { prompt: 'the car accelerates', imageUrl: TEST_IMAGE, resolution: '720p', duration: 5 } },
  { model: 'pixverse_v5_5_i2v', flags: { prompt: 'the car accelerates', imageUrl: TEST_IMAGE, resolution: '720p', duration: 5, audio: true } },
  { model: 'pixverse_v5_6_i2v', flags: { prompt: 'the car accelerates', imageUrl: TEST_IMAGE, resolution: '720p', duration: 5, audio: true, thinkingType: 'auto' } },
  { model: 'pixverse_v6_i2v', flags: { prompt: 'the car accelerates', imageUrl: TEST_IMAGE, resolution: '720p', duration: 5, audio: true, multiShot: true } },
  { model: 'pixverse_v35_transition', flags: { prompt: 'smooth morph between shots', imageUrl: TEST_IMAGE, imageTailUrl: TEST_IMAGE, resolution: '720p', duration: 5 } },
  { model: 'pixverse_v4_transition', flags: { prompt: 'smooth morph between shots', imageUrl: TEST_IMAGE, imageTailUrl: TEST_IMAGE, resolution: '720p', duration: 5 } },
  { model: 'pixverse_v45_transition', flags: { prompt: 'smooth morph between shots', imageUrl: TEST_IMAGE, imageTailUrl: TEST_IMAGE, resolution: '720p', duration: 5 } },
  { model: 'pixverse_v5_transition', flags: { prompt: 'smooth morph between shots', imageUrl: TEST_IMAGE, imageTailUrl: TEST_IMAGE, resolution: '720p', duration: 5 } },
  { model: 'pixverse_v5_5_transition', flags: { prompt: 'smooth morph between shots', imageUrl: TEST_IMAGE, imageTailUrl: TEST_IMAGE, resolution: '720p', duration: 5, audio: true } },
  { model: 'pixverse_v5_6_transition', flags: { prompt: 'smooth morph between shots', imageUrl: TEST_IMAGE, imageTailUrl: TEST_IMAGE, resolution: '720p', duration: 5, audio: true, thinkingType: 'auto' } },
  { model: 'pixverse_v6_transition', flags: { prompt: 'smooth morph between shots', imageUrl: TEST_IMAGE, imageTailUrl: TEST_IMAGE, resolution: '720p', duration: 5, audio: true } },
  { model: 'pixverse_v5_6_fusion', flags: { prompt: '@hero races through neon streets', imageUrl: TEST_IMAGE, referenceNames: ['hero'], referenceTypes: ['subject'], aspectRatio: '16:9', resolution: '720p', duration: 5, audio: true } },

  // ── 3D ────────────────────────────────────────────────────────────────────

  { model: 'volces_seed3d',            flags: { prompt: 'a sci-fi toy car collectible', imageUrl: TEST_IMAGE } },
  { model: 'tencent_hunyuan_3d',       flags: { prompt: 'a sci-fi toy car collectible', resultFormat: 'GLB' } },
  { model: 'tencent_hunyuan_3d_pro',   flags: { prompt: 'a sci-fi toy car collectible', faceCount: 80000, generateType: 'Normal', polygonType: 'triangle' } },
  { model: 'tencent_hunyuan_3d_rapid', flags: { prompt: 'a sci-fi toy car collectible', resultFormat: 'GLB' } },
  { model: 'tripo3d_image_to_model',   flags: { imageUrl: TEST_IMAGE, texture: 1, pbr: 1 } },
  { model: 'tripo3d_multiview_to_model', flags: { imageUrls: [TEST_IMAGE, TEST_IMAGE, TEST_IMAGE, TEST_IMAGE], texture: 0, pbr: 0, quad: 0, generateParts: 1 } },
  { model: 'tripo3d_text_to_model',    flags: { prompt: 'a sci-fi toy car collectible', style: 'low_poly', orientation: 'front' } },

  // ── 音频 ──────────────────────────────────────────────────────────────────

  { model: 'lyria_3_pro_preview',  flags: { prompt: 'epic orchestral sci-fi theme, fast paced' } },
  { model: 'mureka_song_generator', flags: {
    prompt: 'futuristic car racing anthem',
    lyrics: 'Speed of light, burning bright\nThrough the neon night we ride\nFuture calls, never fall\nRacing to the other side',
  }},
  { model: 'kling_video_to_audio', flags: { videoUrl: 'https://example.com/clip.mp4', soundEffectPrompt: 'engine roar and wind', bgmPrompt: 'electronic pulse' }, skip: 'needs stable public input video asset' },
];

// ── 结果统计 ──────────────────────────────────────────────────────────────────

interface Result {
  model: string;
  category: string;
  status: 'pass' | 'skip' | 'fail';
  taskId?: string;
  output?: string[];
  error?: string;
  ms: number;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function green(s: string)  { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string)    { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }
function dim(s: string)    { return `\x1b[2m${s}\x1b[0m`; }
function bold(s: string)   { return `\x1b[1m${s}\x1b[0m`; }

function pad(s: string, n: number) { return s.padEnd(n, ' '); }

// ── 主测试逻辑 ────────────────────────────────────────────────────────────────

async function runCase(c: Case): Promise<Result> {
  const start = Date.now();
  const providerDef = getProvider(c.model);
  const category = providerDef?.category ?? 'unknown';

  if (c.skip) {
    return { model: c.model, category, status: 'skip', error: c.skip, ms: 0 };
  }

  if (!providerDef) {
    return { model: c.model, category, status: 'fail', error: 'model not registered', ms: 0 };
  }

  const config = loadConfig({
    apiKey: API_KEY,
    baseUrl: GATEWAY_ROOT,
    timeout: TIMEOUT_S,
    quiet: true,
    verbose: false,
    noColor: true,
    nonInteractive: true,
    async: false,
    yes: false,
    dryRun: false,
    output: 'json',
  });

  try {
    const body = providerDef.buildBody(c.model, (c.flags['prompt'] as string) ?? '', c.flags);
    const url  = generationEndpoint(config);

    const createResp = await requestJson<{ id: string; status: string }>(config, {
      url,
      method: 'POST',
      body,
    });

    const taskId = createResp.id;
    if (!taskId) throw new Error('no task ID in response');

    const task = await pollTask(config, { taskId });

    const urls: string[] = [];
    for (const out of task.output ?? []) {
      for (const content of out.content ?? []) {
        if (content.url) urls.push(content.url);
      }
    }

    return {
      model: c.model,
      category,
      status: 'pass',
      taskId,
      output: urls,
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      model: c.model,
      category,
      status: 'fail',
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    };
  }
}

// ── 入口 ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.error(red('✗ SAC_API_KEY is not set. Run:'));
    console.error(red('  SAC_API_KEY=sa-xxx SAC_BASE_URL=https://gateway.example.com node dist/test/integration/all-models.js'));
    process.exit(1);
  }

  if (!GATEWAY_ROOT) {
    console.error(red('✗ SAC_BASE_URL is not set. Run:'));
    console.error(red('  SAC_API_KEY=sa-xxx SAC_BASE_URL=https://gateway.example.com node dist/test/integration/all-models.js'));
    process.exit(1);
  }

  const cases = CASES.filter(c => !FILTER || FILTER.has(c.model));
  const active = cases.filter(c => !c.skip);
  const skipped = cases.filter(c => c.skip);

  console.log(bold(`\nSAC Integration Test — ${cases.length} models (${active.length} active, ${skipped.length} skipped)`));
  if (FILTER) console.log(yellow(`  FILTER: ${[...FILTER].join(', ')}`));
  console.log(dim(`  Gateway: ${GATEWAY_ROOT}`));
  console.log(dim(`  Concurrency: ${CONCURRENCY} at a time`));
  console.log();

  const wallStart = Date.now();

  // Run with concurrency limit to avoid proxy/connection overload
  const allResults: Result[] = [];

  // Skipped cases resolve immediately
  for (const c of cases) {
    if (c.skip) {
      const cat = getProvider(c.model)?.category ?? 'unknown';
      allResults.push({ model: c.model, category: cat, status: 'skip', error: c.skip, ms: 0 });
    }
  }

  // Active cases run with concurrency limit
  const activeCases = cases.filter(c => !c.skip);
  console.log(dim(`Running ${activeCases.length} active cases (concurrency=${CONCURRENCY})...`));

  let idx = 0;
  const pool: Promise<void>[] = [];
  const activeResults: Result[] = [];

  async function runNext(): Promise<void> {
    while (idx < activeCases.length) {
      const c = activeCases[idx++]!;
      const result = await runCase(c);
      activeResults.push(result);
    }
  }

  for (let i = 0; i < Math.min(CONCURRENCY, activeCases.length); i++) {
    pool.push(runNext());
  }
  await Promise.all(pool);

  // Merge skip + active results in original CASES order
  const resultMap = new Map<string, Result>();
  for (const r of [...allResults, ...activeResults]) resultMap.set(r.model, r);
  const orderedResults = cases.map(c => resultMap.get(c.model)!).filter(Boolean);

  // 解包（runCase 内部已 catch，不会 reject）
  const categoryOrder = ['image', 'video', 'audio'] as const;
  const MODEL_W = 34;

  for (const cat of categoryOrder) {
    const catResults = orderedResults.filter(r => r.category === cat);
    if (catResults.length === 0) continue;

    const activeCount = catResults.filter(r => r.status !== 'skip').length;
    console.log(bold(`── ${cat.toUpperCase()} (${catResults.length}, ${activeCount} active) ─────────────────────────────`));

    for (const r of catResults) {
      if (r.status === 'pass') {
        const elapsed = `${(r.ms / 1000).toFixed(1)}s`;
        const urls    = r.output?.length ? ` → ${r.output.length} file(s)` : '';
        console.log(`  ${pad(r.model, MODEL_W)} ${green('PASS')}${dim(` ${elapsed}${urls}`)}`);
        for (const u of r.output ?? []) console.log(dim(`    ${u}`));
      } else if (r.status === 'skip') {
        console.log(`  ${pad(r.model, MODEL_W)} ${yellow('SKIP')}${dim(` ${r.error ?? ''}`)}`);
      } else {
        console.log(`  ${pad(r.model, MODEL_W)} ${red('FAIL')} ${r.error ?? 'unknown error'}`);
      }
    }
    console.log();
  }

  // ── 汇总 ──────────────────────────────────────────────────────────────────

  const pass   = orderedResults.filter(r => r.status === 'pass').length;
  const fail   = orderedResults.filter(r => r.status === 'fail').length;
  const skip   = orderedResults.filter(r => r.status === 'skip').length;
  const total  = orderedResults.length;
  const wallS  = ((Date.now() - wallStart) / 1000).toFixed(1);

  console.log(bold('── SUMMARY ──────────────────────────────────────────'));
  console.log(`  Total    : ${total}`);
  console.log(`  ${green('Pass')}     : ${pass}`);
  if (skip) console.log(`  ${yellow('Skip')}     : ${skip}`);
  if (fail) console.log(`  ${red('Fail')}     : ${fail}`);
  console.log(`  Wall time: ${wallS}s  (longest single task)`);

  if (fail > 0) {
    console.log(bold('\nFailed models:'));
    for (const r of orderedResults.filter(r => r.status === 'fail')) {
      console.log(`  ${red('✗')} ${r.model} — ${r.error}`);
    }
    console.log();
    process.exit(1);
  }

  console.log(green('\nAll active tests passed.\n'));
}

main().catch(err => {
  console.error(red('\nFatal:'), err instanceof Error ? err.message : String(err));
  process.exit(1);
});
