import { defineCommand } from '../../command';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { request, requestJson } from '../../client/http';
import { chatEndpoint } from '../../client/endpoints';
import { parseSSE } from '../../client/stream';
import { formatOutput, detectOutputFormat } from '../../output/formatter';
import { isInteractive } from '../../utils/env';
import { failIfMissing } from '../../utils/prompt';
import { readFileSync } from 'fs';
import { createInterface } from 'readline';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatResponse {
  id?: string;
  choices?: Array<{
    message?: { role: string; content: string };
    delta?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export const DEFAULT_CHAT_MODEL = 'deepseek-v3-0324';

async function sendMessage(
  config: Config,
  flags: GlobalFlags,
  history: ChatMessage[],
  model: string,
  shouldStream: boolean,
  format: ReturnType<typeof detectOutputFormat>,
): Promise<string> {
  const url = chatEndpoint(config);
  const body: Record<string, unknown> = {
    model,
    messages: history,
    stream: shouldStream,
  };
  if (flags.maxTokens) body.max_tokens = flags.maxTokens as number;
  if (flags.temperature !== undefined) body.temperature = flags.temperature as number;

  if (shouldStream) {
    const res = await request(config, { url, method: 'POST', body });
    let fullText = '';
    for await (const event of parseSSE(res)) {
      if (event.data === '[DONE]') break;
      try {
        const parsed = JSON.parse(event.data) as ChatResponse;
        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          fullText += delta;
          process.stdout.write(delta);
        }
      } catch { /* skip unparseable */ }
    }
    process.stdout.write('\n');
    if (format === 'json') {
      console.log(formatOutput({ content: fullText }, format));
    }
    return fullText;
  } else {
    const response = await requestJson<ChatResponse>(config, { url, method: 'POST', body });
    const text = response.choices?.[0]?.message?.content ?? '';
    if (config.quiet || format === 'text') {
      console.log(text);
    } else {
      console.log(formatOutput(response, format));
    }
    return text;
  }
}

function makeReadLine() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let resolveFn: ((v: string | null) => void) | null = null;

  rl.on('line', line => { resolveFn?.(line); resolveFn = null; });
  rl.on('close', () => { resolveFn?.(null); resolveFn = null; });

  return {
    prompt(text: string): Promise<string | null> {
      process.stdout.write(text);
      return new Promise(resolve => { resolveFn = resolve; });
    },
    close() { rl.close(); },
  };
}

export default defineCommand({
  name: 'chat',
  description: 'Chat with an LLM via the SeaArt model gateway',
  usage: 'sac chat [--message <text>] [flags]',
  options: [
    { flag: '--model <model>',        description: 'Model ID (e.g. deepseek-v3-0324)' },
    { flag: '--message <text>',       description: 'Single-turn message (repeatable). Omit for interactive REPL.', type: 'array' },
    { flag: '--messages-file <path>', description: 'JSON file with messages array (- for stdin)' },
    { flag: '--system <text>',        description: 'System prompt' },
    { flag: '--max-tokens <n>',       description: 'Max tokens to generate', type: 'number' },
    { flag: '--temperature <n>',      description: 'Sampling temperature', type: 'number' },
    { flag: '--stream',               description: 'Stream response tokens', type: 'boolean' },
  ],
  examples: [
    'sac chat                                          # interactive REPL',
    'sac chat --message "Hello"                        # single-turn',
    'sac chat --message "user:Hi" --message "assistant:Hello!" --message "How are you?"',
    'sac chat --system "You are a helpful assistant." --message "Explain recursion"',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const history: ChatMessage[] = [];
    let system: string | undefined = flags.system as string | undefined;

    // Load from file
    if (flags.messagesFile) {
      const filePath = flags.messagesFile as string;
      const raw = filePath === '-'
        ? readFileSync(process.stdin.fd, 'utf-8')
        : readFileSync(filePath, 'utf-8');
      let parsed: Array<{ role: string; content: string }>;
      try {
        parsed = JSON.parse(raw) as Array<{ role: string; content: string }>;
      } catch {
        throw new CLIError(
          `Failed to parse messages file as JSON: ${filePath}`,
          ExitCode.USAGE,
          'File must be a JSON array of { role, content } objects.',
        );
      }
      for (const m of parsed) {
        if (!m.role || typeof m.content !== 'string') continue;
        if (m.role === 'system') system = m.content;
        else history.push(m as ChatMessage);
      }
    }

    // Parse --message flags
    if (flags.message) {
      const validRoles = new Set(['system', 'user', 'assistant']);
      for (const m of flags.message as string[]) {
        const colonIdx = m.indexOf(':');
        const maybeRole = colonIdx !== -1 ? m.slice(0, colonIdx) : '';
        if (validRoles.has(maybeRole)) {
          const content = m.slice(colonIdx + 1);
          if (maybeRole === 'system') system = content;
          else history.push({ role: maybeRole as 'user' | 'assistant', content });
        } else {
          history.push({ role: 'user', content: m });
        }
      }
    }

    const model = (flags.model as string) || config.defaultChatModel || DEFAULT_CHAT_MODEL;
    const format = detectOutputFormat(config.output);
    const shouldStream = flags.stream === true
      || (flags.stream === undefined && process.stdout.isTTY && format !== 'json');

    if (format === 'json' && flags.stream === true) {
      throw new CLIError(
        'Streaming output cannot be combined with --output json.',
        ExitCode.USAGE,
        'Remove --stream or use --output text.',
      );
    }

    // --- Single-turn mode (--message supplied or non-interactive) ---
    if (history.length > 0 || !isInteractive({ nonInteractive: config.nonInteractive })) {
      if (history.length === 0) {
        failIfMissing('message', 'sac chat --message <text>');
      }
      const allMessages: ChatMessage[] = [];
      if (system) allMessages.push({ role: 'system', content: system });
      allMessages.push(...history);

      if (config.dryRun) {
        const body = { model, messages: allMessages, stream: shouldStream };
        console.log(formatOutput({ request: body }, format));
        return;
      }
      await sendMessage(config, flags, allMessages, model, shouldStream, format);
      return;
    }

    // --- Interactive REPL mode ---
    if (format === 'json') {
      throw new CLIError(
        'Interactive chat REPL cannot be combined with --output json.',
        ExitCode.USAGE,
        'Pass --message for single-turn JSON output, or use --output text.',
      );
    }

    const modelLabel = config.noColor ? model : `\x1b[2m${model}\x1b[0m`;
    process.stderr.write(`Chat session started (${modelLabel}). Type "exit" or press Ctrl+C to quit.\n\n`);

    if (config.dryRun) {
      process.stderr.write('[dry-run] REPL mode — no API calls will be made.\n');
      return;
    }

    const sessionHistory: ChatMessage[] = [];
    if (system) sessionHistory.push({ role: 'system', content: system });

    const rl = makeReadLine();

    while (true) {
      const userInput = await rl.prompt('You: ');

      // null = EOF (Ctrl+D)
      if (userInput === null || userInput.trim() === 'exit' || userInput.trim() === 'quit') {
        process.stderr.write('\nBye.\n');
        rl.close();
        break;
      }

      // empty line — just re-prompt
      if (userInput.trim() === '') continue;

      sessionHistory.push({ role: 'user', content: userInput.trim() });

      if (!config.quiet) process.stderr.write('\n');

      let reply: string;
      try {
        reply = await sendMessage(config, flags, sessionHistory, model, shouldStream, format);
      } catch (err) {
        // Print error but keep session alive so user can retry
        process.stderr.write(`Error: ${(err as Error).message}\n`);
        sessionHistory.pop(); // remove the failed user message
        continue;
      }

      sessionHistory.push({ role: 'assistant', content: reply });
      if (!config.quiet) process.stderr.write('\n');
    }
  },
});
