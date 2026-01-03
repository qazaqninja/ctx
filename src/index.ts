#!/usr/bin/env node
import { Command } from 'commander';
import { init } from './commands/init.js';
import { scan } from './commands/scan.js';
import { explain } from './commands/explain.js';
import { inject } from './commands/inject.js';

const program = new Command();

program
  .name('ctx')
  .description('Extract coding patterns from codebases and synthesize them into AI-injectable context')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize .ctx/ directory with empty config files')
  .action(init);

program
  .command('scan')
  .description('Analyze codebase and detect patterns')
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

program.parse();
