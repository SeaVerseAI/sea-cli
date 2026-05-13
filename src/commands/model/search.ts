import { defineCommand } from '../../command';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { formatOutput, detectOutputFormat } from '../../output/formatter';
import { requestJson } from '../../client/http';
import { modelSkillSearchEndpoint } from '../../client/endpoints';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';

interface SearchResult {
  id: string;
  name: string;
  provider: string;
  description: string;
  input: string[];
  output: string[];
  media_type: string;
  tags: string[];
  tags_abbr: string[];
}

interface SearchResponse {
  hits: SearchResult[];
  estimatedTotalHits: number;
}

export default defineCommand({
  name: 'model search',
  description: 'Search available models from the gateway skill index',
  usage: 'sac model search [--query <keyword>] [--input-modality <modality>] [--output-modality <modality>] [--type <tag>] [--provider <name>]',
  options: [
    { flag: '--query <keyword>',   description: 'Full-text search (model name, description, skill content)' },
    { flag: '--input-modality <modality>',  description: 'Filter by input modality: text, image, video, audio (repeatable)', type: 'array' },
    { flag: '--output-modality <modality>', description: 'Filter by output modality: image, video, audio, 3d (repeatable)', type: 'array' },
    { flag: '--type <tag>',        description: 'Filter by tag abbreviation: i2v, t2v, t2i, i2i, r2v, t2a, a2a, i23d, t23d, fx, vext, isr, vsr, lipsync, v2a, vedit', type: 'array' },
    { flag: '--provider <name>',   description: 'Filter by provider: kling, alibaba, volces, vidu, pixverse, tencent, tripo3d, google, mureka, seaart (repeatable)', type: 'array' },
    { flag: '--limit <n>',         description: 'Max results (default: 20)', type: 'number' },
  ],
  examples: [
    'sac model search --query kling',
    'sac model search --input-modality image --output-modality video',
    'sac model search --type i2v --provider alibaba',
    'sac model search --query wan --input-modality image --output-modality video',
    'sac model search --output-modality audio',
    'sac model search',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);

    const params = new URLSearchParams();

    const q = (flags.query as string | undefined) ?? '';
    if (q) params.set('q', q);

    for (const v of (flags.inputModality  as string[] | undefined) ?? []) params.append('input',  v);
    for (const v of (flags.outputModality as string[] | undefined) ?? []) params.append('output', v);
    for (const v of (flags.type   as string[] | undefined) ?? []) params.append('type',     v);
    for (const v of (flags.provider as string[] | undefined) ?? []) params.append('provider', v);

    const limit = flags.limit as number | undefined;
    if (limit) params.set('limit', String(limit));

    let data: SearchResponse;
    try {
      data = await requestJson<SearchResponse>(config, {
        url: modelSkillSearchEndpoint(config, params),
      });
    } catch (err) {
      if (err instanceof CLIError) throw err;
      throw new CLIError(
        `Cannot reach gateway at ${config.multimodalBaseUrl}.`,
        ExitCode.NETWORK,
      );
    }

    if (format === 'json') {
      console.log(formatOutput(data, format));
      return;
    }

    if (data.hits.length === 0) {
      console.log(q ? `No models matching "${q}".` : 'No models found.');
      return;
    }

    const maxModel    = Math.max(...data.hits.map(r => r.name.length));
    const maxProvider = Math.max(...data.hits.map(r => r.provider.length));

    for (const r of data.hits) {
      const name     = r.name.padEnd(maxModel);
      const provider = r.provider.padEnd(maxProvider);
      const abbr     = r.tags_abbr?.length ? `  [${r.tags_abbr.join(',')}]` : '';
      const io       = r.input?.length || r.output?.length
        ? `  ${(r.input ?? []).join('+')}→${(r.output ?? []).join('+')}` : '';
      const desc     = r.description ? `  ${r.description}` : '';
      console.log(`  ${name}  ${provider}${abbr}${io}${desc}`);
    }
    console.log(`\n${data.estimatedTotalHits} model(s) found.`);
  },
});
