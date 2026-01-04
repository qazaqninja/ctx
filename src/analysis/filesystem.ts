import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import ignore from 'ignore';
import YAML from 'yaml';
import type { FileEntry, Exclusions } from '../types/schema.js';

export async function loadExclusions(ctxPath: string): Promise<string[]> {
  const exclusionsPath = path.join(ctxPath, 'exclusions.yaml');
  const gitignorePath = path.join(path.dirname(ctxPath), '.gitignore');

  let patterns: string[] = [];

  if (fs.existsSync(exclusionsPath)) {
    const content = fs.readFileSync(exclusionsPath, 'utf-8');
    const exclusions: Exclusions = YAML.parse(content);
    patterns = [...patterns, ...exclusions.paths];
  }

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    patterns = [...patterns, ...lines];
  }

  return patterns;
}

export async function walkDirectory(root: string, exclusions: string[]): Promise<FileEntry[]> {
  const ig = ignore().add(exclusions);

  const allFiles = await fg('**/*', {
    cwd: root,
    dot: false,
    onlyFiles: true,
    ignore: ['node_modules/**', '.git/**', ...exclusions],
  });

  const sourceExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.go', '.rs', '.java', '.kt', '.swift',
    '.rb', '.php', '.cs', '.cpp', '.c', '.h',
    '.dart',
  ];

  const entries: FileEntry[] = [];

  for (const relativePath of allFiles) {
    const ext = path.extname(relativePath);
    if (!sourceExtensions.includes(ext)) continue;
    if (ig.ignores(relativePath)) continue;

    entries.push({
      path: path.join(root, relativePath),
      relativePath,
      extension: ext,
      isDirectory: false,
    });
  }

  return entries;
}

export function getDirectoryStructure(files: FileEntry[]): Map<string, FileEntry[]> {
  const structure = new Map<string, FileEntry[]>();

  for (const file of files) {
    const dir = path.dirname(file.relativePath);
    if (!structure.has(dir)) {
      structure.set(dir, []);
    }
    structure.get(dir)!.push(file);
  }

  return structure;
}
