import { defineCommand } from '../../command';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { readConfigFile, writeConfigFile } from '../../config/loader';
import { formatOutput, detectOutputFormat } from '../../output/formatter';
import { isInteractive } from '../../utils/env';
import { promptText, failIfMissing } from '../../utils/prompt';
import { DEFAULT_CHAT_MODEL } from './index';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';

export default defineCommand({
  name: 'chat set-model',
  description: 'Set the default chat model',
  usage: 'sac chat set-model [model]',
  options: [
    { flag: '--model <model>', description: 'Model ID to set as default' },
  ],
  examples: [
    'sac chat set-model --model deepseek-v3-0324',
    'sac chat set-model --model claude-sonnet-4-6',
    'sac chat set-model --model gemini-2.5-pro',
  ],
  async run(config: Config, flags: GlobalFlags) {
    let model = flags.model as string | undefined;

    if (!model) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({ message: `Default chat model (current: ${config.defaultChatModel ?? DEFAULT_CHAT_MODEL}):` });
        if (!hint) throw new CLIError('Model is required.', ExitCode.USAGE);
        model = hint;
      } else {
        failIfMissing('model', 'sac chat set-model --model <model-id>');
      }
    }

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      console.log(formatOutput({ would_set: { default_chat_model: model } }, format));
      return;
    }

    const existing = readConfigFile() as Record<string, unknown>;
    existing.default_chat_model = model;
    await writeConfigFile(existing);

    if (format === 'json') {
      console.log(formatOutput({ default_chat_model: model }, format));
      return;
    }

    if (!config.quiet) {
      process.stderr.write(`Default chat model set to: ${model}\n`);
    }
  },
});
