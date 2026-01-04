#!/usr/bin/env node
import { Command } from 'commander';
import { init } from './commands/init.js';
import { scan } from './commands/scan.js';
import { explain } from './commands/explain.js';
import { inject } from './commands/inject.js';
import { mcp } from './commands/mcp.js';

const program = new Command();

program
  .name('ctx')
  .description('Extract coding patterns from codebases and synthesize them into AI-injectable context')
  .version('0.2.0');

program
  .command('init')
  .description('Initialize .ctx/ directory with empty config files')
  .action(init);

program
  .command('scan')
  .description('Analyze codebase and detect patterns')
  .option('--local-ai', 'Enable local AI analysis via Ollama')
  .option('--model <model>', 'Ollama model to use for synthesis (required with --local-ai)')
  .option('--embed-model <model>', 'Ollama model for embeddings (default: nomic-embed-text)')
  .action(scan);

program
  .command('explain')
  .description('Convert analysis into human-readable synthesis')
  .argument('[topic]', 'Optional: architecture, conventions')
  .action(explain);

program
  .command('inject')
  .description('Prepare context for AI consumption')
  .option('--task <task>', 'Specific task to tailor context for')
  .action(inject);

program
  .command('mcp')
  .description('Start MCP server for AI assistant integration (Claude Code, etc.)')
  .action(mcp);

program.parse();
