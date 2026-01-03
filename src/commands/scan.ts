import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { walkDirectory, loadExclusions } from '../analysis/filesystem.js';
import { detectNamingConvention, detectStructurePattern, detectAbstractions, detectLanguageFramework } from '../analysis/patterns.js';
import { inferConventions, writeContextFiles } from '../analysis/conventions.js';

const CTX_DIR = '.ctx';

export async function scan(): Promise<void> {
  const ctxPath = path.join(process.cwd(), CTX_DIR);

  if (!fs.existsSync(ctxPath)) {
    console.error(`Error: ${CTX_DIR}/ not found. Run "ctx init" first.`);
    process.exit(1);
  }

  console.log('Scanning...');

  const exclusions = await loadExclusions(ctxPath);
  const files = await walkDirectory(process.cwd(), exclusions);

  console.log(`Found ${files.length} source files`);

  const naming = detectNamingConvention(files);
  const structure = detectStructurePattern(files);
  const abstractions = detectAbstractions(files);
  const langFramework = detectLanguageFramework(process.cwd());

  const context = inferConventions({
    files,
    naming,
    structure,
    abstractions,
    langFramework,
  });

  await writeContextFiles(ctxPath, context);

  const counts = {
    observed: 0,
    inferred: 0,
    uncertain: 0,
  };

  const countFindings = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') return;
    if ('confidence' in obj && typeof (obj as { confidence: string }).confidence === 'string') {
      const conf = (obj as { confidence: string }).confidence as keyof typeof counts;
      if (conf in counts) counts[conf]++;
    }
    Object.values(obj).forEach(countFindings);
  };

  countFindings(context);

  console.log(`Detected patterns: ${counts.observed} observed, ${counts.inferred} inferred, ${counts.uncertain} uncertain`);
}
