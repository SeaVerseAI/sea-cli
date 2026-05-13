import { defineCommand } from '../../command';
import { request } from '../../client/http';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { modelSkillGetEndpoint } from '../../client/endpoints';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';

export default defineCommand({
  name: 'model get',
  description: 'Get the SKILL.md for a model',
  usage: 'sac model get <model>',
  options: [],
  examples: [
    'sac model get kling_v3',
    'sac model get alibaba_wan27_i2v',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const model = (flags._positional as string[] | undefined)?.[0];
    if (!model) {
      throw new CLIError('Model name is required.', ExitCode.USAGE, 'sac model get <model>');
    }

    let res: Response;
    try {
      res = await request(config, { url: modelSkillGetEndpoint(config, model) });
    } catch (err) {
      if (err instanceof CLIError) {
        if (/HTTP 404/.test(err.message)) {
          throw new CLIError(`Model "${model}" not found.`, ExitCode.GENERAL, 'Run: sac model search to list available models');
        }
        throw err;
      }
      throw new CLIError(
        `Cannot reach gateway at ${config.multimodalBaseUrl}.`,
        ExitCode.NETWORK,
      );
    }

    const text = await res.text();
    process.stdout.write(text);
  },
});
