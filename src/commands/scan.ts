import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { walkDirectory, loadExclusions } from '../analysis/filesystem.js';
import { detectNamingConvention, detectStructurePattern, detectAbstractions, detectLanguageFramework, detectFormatting, detectImportStyle, detectCodeNaming, detectMonorepo, detectDependencyContext } from '../analysis/patterns.js';
import { inferConventions, writeContextFiles } from '../analysis/conventions.js';
import { buildFileIndex, saveFileIndex } from '../analysis/indexer.js';
import { checkConnection, validateModel } from '../ai/ollama.js';
import { chunkFiles, getChunkStats } from '../ai/chunker.js';
import { embedChunks } from '../ai/embeddings.js';
import { analyzeEmbeddings, summarizeAnalysis } from '../ai/analyzer.js';
import { synthesizeConstraints, formatConstraintsForYaml } from '../ai/synthesizer.js';

const CTX_DIR = '.ctx';

interface ScanOptions {
  localAi?: boolean;
  model?: string;
  embedModel?: string;
}

export async function scan(options: ScanOptions = {}): Promise<void> {
  const ctxPath = path.join(process.cwd(), CTX_DIR);

  if (!fs.existsSync(ctxPath)) {
    console.error(`Error: ${CTX_DIR}/ not found. Run "ctx init" first.`);
    process.exit(1);
  }

  // Validate AI options
  if (options.localAi) {
    if (!options.model) {
      console.error('Error: --model is required when using --local-ai');
      console.error('Example: ctx scan --local-ai --model codellama:7b');
      process.exit(1);
    }

    const connCheck = await checkConnection();
    if (!connCheck.ok) {
      console.error(`Error: ${connCheck.error}`);
      process.exit(1);
    }

    const modelCheck = await validateModel(options.model);
    if (!modelCheck.ok) {
      console.error(`Error: ${modelCheck.error}`);
      process.exit(1);
    }

    console.log(`Using local AI: ${options.model}`);

    // Validate or set default embedding model
    const embedModel = options.embedModel || 'nomic-embed-text';
    if (embedModel !== options.model) {
      const embedCheck = await validateModel(embedModel);
      if (!embedCheck.ok) {
        console.error(`Error: Embedding model "${embedModel}" not available.`);
        console.error('Install with: ollama pull nomic-embed-text');
        console.error('Or specify a different model with --embed-model');
        process.exit(1);
      }
      console.log(`Using embedding model: ${embedModel}`);
    }
  }

  console.log('Scanning...');

  const exclusions = await loadExclusions(ctxPath);
  const files = await walkDirectory(process.cwd(), exclusions);

  console.log(`Found ${files.length} source files`);

  // Heuristic analysis (always runs)
  const naming = detectNamingConvention(files);
  const structure = detectStructurePattern(files);
  const abstractions = detectAbstractions(files);
  const langFramework = detectLanguageFramework(process.cwd(), files);
  const formatting = detectFormatting(files);
  const imports = detectImportStyle(files);
  const codeNaming = detectCodeNaming(files);
  const monorepo = detectMonorepo(process.cwd());
  const dependencyContext = detectDependencyContext(process.cwd());

  // Log dependency context for Dart/Flutter projects
  if (dependencyContext && dependencyContext.dependencies.length > 0) {
    console.log(`Found ${dependencyContext.dependencies.length} dependencies, ${dependencyContext.devDependencies.length} dev dependencies`);
  }

  const context = inferConventions({
    files,
    naming,
    structure,
    abstractions,
    langFramework,
    formatting,
    imports,
    codeNaming,
    monorepo,
    dependencyContext,
  });

  // Build compact file index (always generated, replaces heavy embeddings for most use cases)
  console.log('Building file index...');
  const fileIndex = buildFileIndex(files);
  saveFileIndex(ctxPath, fileIndex);
  console.log(`Created index with ${fileIndex.summary.total_keywords} keywords across ${fileIndex.summary.domains_count} domains`);

  // AI analysis (ONLY when --local-ai is used)
  // This includes:
  // 1. Code chunking and embedding generation
  // 2. Semantic clustering and pattern detection
  // 3. LLM-based constraint synthesis
  // Without --local-ai, only deterministic pattern detection is performed
  let aiConstraints: ReturnType<typeof formatConstraintsForYaml> | null = null;
  let semanticPatterns: { patterns: unknown[]; crossFilePatterns: unknown[] } | null = null;

  if (options.localAi && options.model) {
    console.log('\nRunning AI-powered semantic analysis...');

    // Use dedicated embedding model (defaults to nomic-embed-text)
    const embedModel = options.embedModel || 'nomic-embed-text';

    // Chunk code
    const chunks = chunkFiles(files);
    const stats = getChunkStats(chunks);
    console.log(`Extracted ${stats.total} code chunks (${stats.byType.function} functions, ${stats.byType.class} classes)`);

    if (chunks.length > 0) {
      // Embed chunks using embedding model
      console.log('Generating embeddings...');
      let lastProgress = 0;
      const embedded = await embedChunks(chunks, embedModel, ctxPath, (progress) => {
        const percent = Math.round((progress.done / progress.total) * 100);
        if (percent >= lastProgress + 10 || progress.done === progress.total) {
          process.stdout.write(`\r  Embedding: ${percent}% (${progress.done}/${progress.total})`);
          lastProgress = percent;
        }
      });
      console.log('');

      // Analyze embeddings
      console.log('Analyzing patterns...');
      const analysis = analyzeEmbeddings(embedded);
      const summary = summarizeAnalysis(analysis);

      if (summary.length > 0) {
        console.log('Semantic patterns found:');
        summary.forEach(s => console.log(`  - ${s}`));
      }

      // Store semantic patterns for output
      semanticPatterns = {
        patterns: analysis.patterns.map(p => ({
          name: p.name,
          description: p.description,
          confidence: p.confidence,
          evidence: p.evidence,
          files: p.files,
        })),
        crossFilePatterns: analysis.crossFilePatterns.map(p => ({
          name: p.name,
          description: p.description,
          confidence: p.confidence,
          evidence: p.evidence,
          files: p.files,
        })),
      };

      // Synthesize constraints via LLM
      process.stdout.write('Synthesizing constraints...');
      const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let spinnerIdx = 0;
      let lastTokenCount = 0;

      const codebaseInfo = `${langFramework.language.value} ${langFramework.framework?.value || ''} project. ${files.length} files.`;
      const synthesized = await synthesizeConstraints(options.model, analysis, codebaseInfo, (tokens, done) => {
        if (done) {
          process.stdout.write(`\rSynthesizing constraints... done (${tokens} tokens)\n`);
        } else if (tokens > lastTokenCount) {
          lastTokenCount = tokens;
          spinnerIdx = (spinnerIdx + 1) % spinnerFrames.length;
          process.stdout.write(`\rSynthesizing constraints... ${spinnerFrames[spinnerIdx]} ${tokens} tokens`);
        }
      });

      if (synthesized.architectureRules.length > 0 || synthesized.constraints.length > 0) {
        console.log('AI-generated constraints:');
        synthesized.architectureRules.slice(0, 3).forEach(r => console.log(`  ✓ ${r}`));
        synthesized.constraints.slice(0, 3).forEach(c => console.log(`  ✗ ${c}`));
      }

      aiConstraints = formatConstraintsForYaml(synthesized);
    }
  }

  // Write context files
  await writeContextFiles(ctxPath, context);

  // Write semantic patterns if available
  if (semanticPatterns) {
    const archPath = path.join(ctxPath, 'architecture.yaml');
    const archContent = YAML.parse(fs.readFileSync(archPath, 'utf-8'));
    archContent.semantic_patterns = semanticPatterns.patterns;
    archContent.cross_file_patterns = semanticPatterns.crossFilePatterns;
    fs.writeFileSync(archPath, YAML.stringify(archContent));
  }

  // Write AI constraints if available
  if (aiConstraints) {
    const constraintsPath = path.join(ctxPath, 'constraints.yaml');
    fs.writeFileSync(constraintsPath, YAML.stringify(aiConstraints.ai_constraints));
  }

  // Count findings
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
  if (semanticPatterns) {
    countFindings(semanticPatterns);
  }

  console.log(`\nDetected patterns: ${counts.observed} observed, ${counts.inferred} inferred, ${counts.uncertain} uncertain`);
  console.log(`\nGenerated files:`);
  console.log(`  ${CTX_DIR}/index.yaml (compact file index for quick lookups)`);
  console.log(`  ${CTX_DIR}/manifest.yaml`);
  console.log(`  ${CTX_DIR}/conventions.yaml`);
  console.log(`  ${CTX_DIR}/architecture.yaml`);

  if (options.localAi) {
    console.log(`  ${CTX_DIR}/embeddings.json (AI embeddings cache - only with --local-ai)`);
    if (aiConstraints) {
      console.log(`  ${CTX_DIR}/constraints.yaml (AI-generated constraints)`);
    }
  }
}
