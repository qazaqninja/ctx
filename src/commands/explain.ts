import fs from 'fs';
import path from 'path';
import { loadContext } from '../synthesis/explainer.js';
import { explainArchitecture, explainConventions, explainUncertain } from '../synthesis/explainer.js';

const CTX_DIR = '.ctx';

export async function explain(topic?: string): Promise<void> {
  const ctxPath = path.join(process.cwd(), CTX_DIR);

  if (!fs.existsSync(ctxPath)) {
    console.error(`Error: ${CTX_DIR}/ not found. Run "ctx init" first.`);
    process.exit(1);
  }

  const context = await loadContext(ctxPath);

  if (topic === 'architecture') {
    console.log(explainArchitecture(context.architecture));
  } else if (topic === 'conventions') {
    console.log(explainConventions(context.conventions));
  } else {
    console.log('This codebase favors:\n');
    console.log(explainArchitecture(context.architecture));
    console.log(explainConventions(context.conventions));

    const uncertain = explainUncertain(context);
    if (uncertain) {
      console.log('\nUncertain:');
      console.log(uncertain);
    }
  }
}
