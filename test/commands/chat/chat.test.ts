import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { default as chatCommand, DEFAULT_CHAT_MODEL } from '../../../src/commands/chat/index.ts';
import type { Config } from '../../../src/config/schema.ts';
import { CLIError } from '../../../src/errors/base.ts';
import { ExitCode } from '../../../src/errors/codes.ts';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    apiKey: 'test-key',
    fileApiKey: undefined,
    configPath: '/tmp/test.json',
    multimodalBaseUrl: 'https://api.example.com',
    llmBaseUrl: 'https://api.example.com',
    output: 'json',
    timeout: 10,
    verbose: false,
    quiet: true,
    noColor: true,
    yes: false,
    dryRun: false,
    nonInteractive: true,
    async: false,
    ...overrides,
  };
}

function makeFlags(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    quiet: true,
    verbose: false,
    noColor: true,
    yes: false,
    dryRun: false,
    help: false,
    nonInteractive: true,
    async: false,
    stream: false,
    ...overrides,
  };
}

describe('chat command', () => {
  it('has correct command name', () => {
    assert.strictEqual(chatCommand.name, 'chat');
  });

  it('DEFAULT_CHAT_MODEL is deepseek-v3-0324', () => {
    assert.strictEqual(DEFAULT_CHAT_MODEL, 'deepseek-v3-0324');
  });

  it('throws on missing --message in non-interactive mode', async () => {
    await assert.rejects(
      () => chatCommand.execute(makeConfig(), makeFlags()),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('message'));
        return true;
      },
    );
  });

  it('dry-run outputs request body without calling API', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await chatCommand.execute(config, makeFlags({ message: ['Hello'], dryRun: true }));
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.ok(parsed.request);
    assert.strictEqual(parsed.request.model, DEFAULT_CHAT_MODEL);
    assert.ok(Array.isArray(parsed.request.messages));
    assert.strictEqual(parsed.request.messages[0].content, 'Hello');
    assert.strictEqual(parsed.request.messages[0].role, 'user');
  });

  it('--model flag overrides default model', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await chatCommand.execute(
        config,
        makeFlags({ message: ['Hi'], model: 'gpt-4o', dryRun: true }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.model, 'gpt-4o');
  });

  it('config.defaultChatModel overrides built-in default when no --model flag', async () => {
    const config = makeConfig({ dryRun: true, defaultChatModel: 'qwen3-max' });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await chatCommand.execute(config, makeFlags({ message: ['Hi'], dryRun: true }));
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.model, 'qwen3-max');
  });

  it('--model flag takes priority over config.defaultChatModel', async () => {
    const config = makeConfig({ dryRun: true, defaultChatModel: 'qwen3-max' });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await chatCommand.execute(
        config,
        makeFlags({ message: ['Hi'], model: 'deepseek-r1', dryRun: true }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.model, 'deepseek-r1');
  });

  it('parses role-prefixed messages correctly', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await chatCommand.execute(config, makeFlags({
        message: ['user:Hello', 'assistant:Hi there', 'How are you?'],
        dryRun: true,
      }));
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    const msgs = parsed.request.messages;
    assert.strictEqual(msgs[0].role, 'user');
    assert.strictEqual(msgs[0].content, 'Hello');
    assert.strictEqual(msgs[1].role, 'assistant');
    assert.strictEqual(msgs[1].content, 'Hi there');
    assert.strictEqual(msgs[2].role, 'user');
    assert.strictEqual(msgs[2].content, 'How are you?');
  });

  it('system: prefix extracts system message and adds it first', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await chatCommand.execute(config, makeFlags({
        message: ['system:Be helpful', 'Hello'],
        dryRun: true,
      }));
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    const msgs = parsed.request.messages;
    assert.strictEqual(msgs[0].role, 'system');
    assert.strictEqual(msgs[0].content, 'Be helpful');
  });

  it('--system flag sets system prompt', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await chatCommand.execute(config, makeFlags({
        message: ['Hello'],
        system: 'You are a pirate.',
        dryRun: true,
      }));
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    const sysMsg = parsed.request.messages.find((m: { role: string }) => m.role === 'system');
    assert.ok(sysMsg);
    assert.strictEqual(sysMsg.content, 'You are a pirate.');
  });

  it('rejects --stream with --output json', async () => {
    await assert.rejects(
      () => chatCommand.execute(
        makeConfig({ output: 'json' }),
        makeFlags({ message: ['Hello'], stream: true }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.USAGE);
        assert.ok(err.message.includes('--output json'));
        return true;
      },
    );
  });

  it('rejects interactive REPL with --output json', async () => {
    const originalStdoutIsTTY = process.stdout.isTTY;
    const originalStdinIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    try {
      await assert.rejects(
        () => chatCommand.execute(
          makeConfig({ output: 'json', nonInteractive: false }),
          makeFlags({ nonInteractive: false }),
        ),
        (err: unknown) => {
          assert.ok(err instanceof CLIError);
          assert.strictEqual(err.exitCode, ExitCode.USAGE);
          assert.ok(err.message.includes('REPL'));
          return true;
        },
      );
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: originalStdoutIsTTY, configurable: true });
      Object.defineProperty(process.stdin, 'isTTY', { value: originalStdinIsTTY, configurable: true });
    }
  });
});
