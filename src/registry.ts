import type { Command } from './command';
import { CLIError } from './errors/base';
import { ExitCode } from './errors/codes';

import authLogin    from './commands/auth/login';
import authStatus   from './commands/auth/status';
import authLogout   from './commands/auth/logout';
import generateImage from './commands/generate/image';
import generateVideo from './commands/generate/video';
import generateAudio from './commands/generate/audio';
import generate3d    from './commands/generate/3d';
import generateTask  from './commands/generate/task';
import generateSubmit from './commands/generate/submit';
import chat          from './commands/chat/index';
import chatModels    from './commands/chat/models';
import chatSetModel  from './commands/chat/set-model';
import modelSearch   from './commands/model/search';
import modelGet      from './commands/model/get';
import update        from './commands/update/index';
import configShow    from './commands/config/show';
import configSet     from './commands/config/set';
import { modelsByCategory } from './commands/generate/image';

export type { Command, OptionDef } from './command';

interface CommandNode {
  command?: Command;
  children: Map<string, CommandNode>;
}

class CommandRegistry {
  private root: CommandNode = { children: new Map() };

  constructor(commands: Record<string, Command>) {
    for (const [path, cmd] of Object.entries(commands)) {
      this.register(path, cmd);
    }
  }

  private register(path: string, command: Command): void {
    const parts = path.split(' ');
    let node = this.root;
    for (const part of parts) {
      if (!node.children.has(part)) {
        node.children.set(part, { children: new Map() });
      }
      node = node.children.get(part)!;
    }
    node.command = command;
  }

  getAllCommands(): Command[] {
    const commands: Command[] = [];
    const traverse = (node: CommandNode) => {
      if (node.command) commands.push(node.command);
      for (const child of node.children.values()) traverse(child);
    };
    traverse(this.root);
    return commands;
  }

  topLevelCommands(): string[] {
    return Array.from(this.root.children.keys());
  }

  resolve(commandPath: string[]): { command: Command; extra: string[] } {
    let node = this.root;
    const matched: string[] = [];

    for (const part of commandPath) {
      const child = node.children.get(part);
      if (!child) break;
      node = child;
      matched.push(part);
    }

    if (node.command) {
      return { command: node.command, extra: commandPath.slice(matched.length) };
    }

    // Single child: auto-forward
    if (matched.length > 0 && node.children.size === 1) {
      const [, child] = node.children.entries().next().value as [string, CommandNode];
      if (child.command) {
        return { command: child.command, extra: commandPath.slice(matched.length) };
      }
    }

    if (matched.length > 0 && node.children.size > 0) {
      const subcommands = Array.from(node.children.entries())
        .map(([name, n]) => {
          if (n.command) return `  ${matched.join(' ')} ${name}    ${n.command.description}`;
          const subs = Array.from(n.children.keys()).join(', ');
          return `  ${matched.join(' ')} ${name} [${subs}]`;
        })
        .join('\n');
      throw new CLIError(
        `Unknown command: sac ${commandPath.join(' ')}\n\nAvailable commands:\n${subcommands}`,
        ExitCode.USAGE,
        `sac ${matched.join(' ')} --help`,
      );
    }

    throw new CLIError(
      `Unknown command: sac ${commandPath.join(' ')}`,
      ExitCode.USAGE,
      'sac --help',
    );
  }

  private bold   = (s: string, out: NodeJS.WriteStream) => out.isTTY ? `\x1b[1m${s}\x1b[0m` : s;
  private accent = (s: string, out: NodeJS.WriteStream) => out.isTTY ? `\x1b[38;2;74;144;226m${s}\x1b[0m` : s;
  private dim    = (s: string, out: NodeJS.WriteStream) => out.isTTY ? `\x1b[2m${s}\x1b[0m` : s;

  printHelp(commandPath: string[], out: NodeJS.WriteStream = process.stdout): void {
    if (commandPath.length === 0) {
      this.printRootHelp(out);
      return;
    }

    let node = this.root;
    for (const part of commandPath) {
      const child = node.children.get(part);
      if (!child) { this.printRootHelp(out); return; }
      node = child;
    }

    if (node.command) {
      this.printCommandHelp(node.command, out);
      return;
    }

    const prefix = commandPath.join(' ');
    out.write(`\n${this.bold('Usage:', out)} sac ${prefix} <command> [flags]\n\n`);
    out.write(`${this.bold('Commands:', out)}\n`);
    this.printChildren(node, prefix, out);
    out.write('\n');
  }

  private printRootHelp(out: NodeJS.WriteStream): void {
    // SeaArt brand colors: teal/blue
    const LOGO = [
      ' ___  _   ___ ',
      '/ __|| | / __|',
      '\\__ \\| || (__ ',
      '|___/|_| \\___|',
    ];
    const GRADIENT: [number, number, number][] = [
      [74,  144, 226],
      [56,  189, 248],
      [34,  211, 238],
      [20,  184, 166],
    ];

    out.write('\n');
    for (let i = 0; i < LOGO.length; i++) {
      if (out.isTTY) {
        const [r, g, b] = GRADIENT[i]!;
        out.write(`\x1b[1;38;2;${r};${g};${b}m${LOGO[i]}\x1b[0m\n`);
      } else {
        out.write(LOGO[i] + '\n');
      }
    }

    const b = (s: string) => this.bold(s, out);
    const a = (s: string) => this.accent(s, out);
    const d = (s: string) => this.dim(s, out);

    out.write(`
${b('Usage:')} sac <command> [flags]

${b('Commands:')}
  ${a('auth login')}          ${d('Save your API key')}
  ${a('auth status')}         ${d('Show authentication state')}
  ${a('auth logout')}         ${d('Remove stored API key')}
  ${a('generate image')}      ${d('Generate images (sdxl, z_image, volces, alibaba, nano, etc.)')}
  ${a('generate video')}      ${d('Generate videos (vidu, kling, alibaba wanx, etc.)')}
  ${a('generate audio')}      ${d('Generate audio / music (lyria, mureka, etc.)')}
  ${a('generate 3d')}         ${d('Generate 3D models (volces, etc.)')}
  ${a('generate task')}       ${d('Query generation task status')}
  ${a('generate submit')}     ${d('Submit a raw body and poll for results')}
  ${a('model search')}        ${d('Search available models from the gateway skill index')}
  ${a('model get')}           ${d('Get model SKILL.md from the gateway skill index')}
  ${a('chat')}                ${d('Chat with an LLM model')}
  ${a('chat models')}         ${d('List available LLM models')}
  ${a('chat set-model')}      ${d('Set the default chat model')}
  ${a('update')}              ${d('Update sac to the latest version')}
  ${a('config show')}         ${d('Display current configuration')}
  ${a('config set')}          ${d('Set a configuration value')}

${b('Image Models:')}
  ${d(modelsByCategory('image').join(', '))}

${b('Video Models:')}
  ${d(modelsByCategory('video').join(', '))}

${b('Audio Models:')}
  ${d(modelsByCategory('audio').join(', '))}

${b('3D Models:')}
  ${d(modelsByCategory('3d').join(', '))}

${b('Global Flags:')}
  ${a('--api-key <token>')}       ${d('Temporary bearer token for this command only; auth login persists it')}
  ${a('--base-url <url>')}        ${d('Temporary gateway base URL for this command only')}
  ${a('--output <format>')}       ${d('Output format: text, json')}
  ${a('--timeout <seconds>')}     ${d('Request timeout (default: 300)')}
  ${a('--quiet')}                 ${d('Suppress non-essential output')}
  ${a('--verbose')}               ${d('Print HTTP request/response details')}
  ${a('--no-color')}              ${d('Disable ANSI colors')}
  ${a('--dry-run')}               ${d('Show what would happen without executing')}
  ${a('--non-interactive')}       ${d('Disable interactive prompts')}
  ${a('--version')}               ${d('Print version and exit')}
  ${a('--help')}                  ${d('Show help')}

${b('Environment Variables:')}
  ${a('SAC_API_KEY')}             ${d('Bearer token')}
  ${a('SAC_OUTPUT')}              ${d('Default output format')}
  ${a('SAC_TIMEOUT')}             ${d('Default timeout in seconds')}
  ${a('SAC_VERBOSE')}             ${d('Enable verbose output (1)')}
  ${a('SAC_BASE_URL')}            ${d('Gateway base URL; /model and /llm are derived')}

${b('Getting Help:')}
  ${d('Add --help after any command:')} sac generate image --help
`);
  }

  private printCommandHelp(cmd: Command, out: NodeJS.WriteStream): void {
    const b = (s: string) => this.bold(s, out);
    const a = (s: string) => this.accent(s, out);
    const d = (s: string) => this.dim(s, out);

    out.write(`\n${cmd.description}\n`);
    if (cmd.usage) out.write(`${b('Usage:')} ${cmd.usage}\n`);
    if (cmd.options && cmd.options.length > 0) {
      const maxLen = Math.max(...cmd.options.map(o => o.flag.length));
      out.write(`\n${b('Options:')}\n`);
      for (const opt of cmd.options) {
        const req = opt.required ? ' (required)' : '';
        out.write(`  ${a(opt.flag.padEnd(maxLen + 2))} ${d(opt.description + req)}\n`);
      }
    }
    if (cmd.examples && cmd.examples.length > 0) {
      out.write(`\n${b('Examples:')}\n`);
      for (const ex of cmd.examples) {
        out.write(`  ${d(ex)}\n`);
      }
    }
    out.write(`\n${d('Global flags (--api-key, --output, --quiet, etc.) are always available.')}\n`);
    if (cmd.name === 'auth login') {
      out.write(`${d('Note: auth login --api-key saves the key to config; the global --api-key override on other commands is temporary only.')}\n`);
    }
    out.write(`${d('Run')} sac --help ${d('for the full list.')}\n`);
  }

  private printChildren(node: CommandNode, prefix: string, out: NodeJS.WriteStream): void {
    const entries: Array<{ fullName: string; description: string }> = [];
    const collect = (n: CommandNode, p: string) => {
      for (const [name, child] of n.children) {
        if (child.command) entries.push({ fullName: `${p} ${name}`, description: child.command.description });
        if (child.children.size > 0) collect(child, `${p} ${name}`);
      }
    };
    collect(node, prefix);
    const maxLen = Math.max(...entries.map(e => e.fullName.length));
    for (const { fullName, description } of entries) {
      out.write(`  ${this.accent(fullName.padEnd(maxLen), out)}  ${this.dim(description, out)}\n`);
    }
  }
}

export const registry = new CommandRegistry({
  'auth login':       authLogin,
  'auth status':      authStatus,
  'auth logout':      authLogout,
  'generate image':   generateImage,
  'generate video':   generateVideo,
  'generate audio':   generateAudio,
  'generate 3d':      generate3d,
  'generate task':    generateTask,
  'generate submit':  generateSubmit,
  'model search':     modelSearch,
  'model get':        modelGet,
  'chat':             chat,
  'chat models':      chatModels,
  'chat set-model':   chatSetModel,
  'update':           update,
  'config show':      configShow,
  'config set':       configSet,
});
