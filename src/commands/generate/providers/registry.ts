/**
 * Provider registry for image generation models.
 *
 * To add a new provider:
 *   1. Create src/commands/generate/providers/<provider>.ts
 *   2. Import { registerProvider } from './store' and call it
 *   3. Add an import for your file at the bottom of this file
 */

// Providers must be imported before any registry query.
// esbuild inlines modules — explicit imports here guarantee
// registerProvider() calls happen before getProvider()/allModels().
import './seaart';
import './volces';
import './alibaba';
import './nano';
import './vidu';
import './kling';
import './pixverse';
import './audio';
import './minimax';
import './volces-video';
import './volces-3d';
import './tencent-image';
import './tencent-3d';
import './tencent-video';
import './tripo3d';

export type { ProviderDef, ModelCategory } from './store';
export { registerProvider } from './store';
import { _registry } from './store';
import type { ModelCategory } from './store';

/** Look up the provider for a given model ID. Returns undefined if unknown. */
export function getProvider(model: string) {
  return _registry.get(model);
}

/** All registered model IDs in registration order */
export function allModels(): string[] {
  return Array.from(_registry.keys());
}

/** All registered model IDs filtered by category */
export function modelsByCategory(category: ModelCategory): string[] {
  const out: string[] = [];
  for (const [model, def] of _registry) {
    if (def.category === category) out.push(model);
  }
  return out;
}

/** All registered model IDs grouped by provider name, optionally filtered by category */
export function modelsByProvider(category?: ModelCategory): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [model, def] of _registry) {
    if (category && def.category !== category) continue;
    const list = out.get(def.provider) ?? [];
    list.push(model);
    out.set(def.provider, list);
  }
  return out;
}
