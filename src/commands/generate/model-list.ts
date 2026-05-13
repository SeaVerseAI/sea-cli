export interface ProviderModelsEntry {
  provider: string;
  models: string[];
}

export function buildProviderModelsList(
  byProvider: Map<string, string[]>,
  filterProvider?: string,
): ProviderModelsEntry[] {
  const providers: ProviderModelsEntry[] = [];
  for (const [provider, models] of byProvider) {
    if (filterProvider && provider !== filterProvider) continue;
    providers.push({ provider, models });
  }
  return providers;
}
