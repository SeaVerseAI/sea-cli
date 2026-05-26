import type { Config } from '../config/schema';

/**
 * POST /v1/generation — create a generation task
 */
export function generationEndpoint(config: Config): string {
  return `${config.multimodalBaseUrl}/v1/generation`;
}

/**
 * GET /v1/generation/task/{id} — query task status
 */
export function taskEndpoint(config: Config, taskId: string): string {
  return `${config.multimodalBaseUrl}/v1/generation/task/${taskId}`;
}

/**
 * POST /v1/image/scan — content safety scan for image/video URLs
 */
export function contentSafetyEndpoint(config: Config): string {
  return `${config.multimodalBaseUrl}/v1/image/scan`;
}

/**
 * POST /llm/v1/chat/completions — LLM chat
 */
export function chatEndpoint(config: Config): string {
  return `${config.llmBaseUrl}/v1/chat/completions`;
}

/**
 * GET /llm/v1/models — list available LLM models
 */
export function modelsEndpoint(config: Config): string {
  return `${config.llmBaseUrl}/v1/models`;
}

/**
 * GET /v1/models/skill/search — search models via Meilisearch
 */
export function modelSkillSearchEndpoint(config: Config, params: URLSearchParams): string {
  return `${config.multimodalBaseUrl}/v1/models/skill/search?${params.toString()}`;
}

/**
 * GET /v1/models/skill/{model} — get SKILL.md content for a model
 */
export function modelSkillGetEndpoint(config: Config, model: string): string {
  return `${config.multimodalBaseUrl}/v1/models/skill/${encodeURIComponent(model)}`;
}
