import type { GlobalFlags } from '../../../types/flags';

export type ModelCategory = 'image' | 'video' | 'audio' | '3d';

export interface ProviderDef {
  provider: string;
  models: readonly string[];
  category: ModelCategory;
  requiresPrompt?(model: string): boolean;
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown>;
}

export const _registry = new Map<string, ProviderDef>();

export function registerProvider(def: ProviderDef): void {
  for (const model of def.models) {
    _registry.set(model, def);
  }
}
