import fs from 'fs';
import path from 'path';
import { loadContext } from '../synthesis/explainer.js';
import { formatForAI } from '../synthesis/injector.js';

const CTX_DIR = '.ctx';

interface InjectOptions {
  task?: string;
}

export async function inject(options: InjectOptions): Promise<void> {
  const ctxPath = path.join(process.cwd(), CTX_DIR);

  if (!fs.existsSync(ctxPath)) {
    console.error(`Error: ${CTX_DIR}/ not found. Run "ctx init" first.`);
    process.exit(1);
  }

  const context = await loadContext(ctxPath);
  const output = formatForAI(context, options.task);

  console.log(output);
}
