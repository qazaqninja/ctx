# CLAUDE.md — ctx CLI

## What this is

A local-first CLI that teaches AI how you write software.

Not prompts. Not memory. Not cloud magic.  
Your actual projects become the source of truth.

**One-liner:** AI is a consumer of this tool — not the foundation.

## The problem we're solving

Developers using AI suffer from cognitive friction:
- AI fights their architecture
- AI ignores existing patterns
- AI rewrites things "its way"
- Constant re-explaining: "we use repository pattern", "we don't do this here"

This tool extracts **behavior, structure, and decisions** from codebases — then synthesizes them into human-readable, AI-injectable context.

## Core philosophy

- **Ergonomics precede intelligence** — if commands feel right, internals can evolve
- **Observe, don't assume** — every inference is marked as observed/inferred/uncertain
- **The user owns the context** — human-editable first, machine-readable second
- **Respectful of developer intent** — amplify how they already think, don't automate them

---

## Command surface (v0)

Binary name: `ctx`

### `ctx init`

Creates `.ctx/` directory with empty but explicit config files.

```bash
ctx init
```

Creates:
```
.ctx/
  manifest.yaml        # what this repo is
  conventions.yaml     # how we write code  
  architecture.yaml    # how we structure systems
  exclusions.yaml      # what NOT to consider
```

No analysis yet. Just structure. User acknowledges intent.

### `ctx scan`

Reads codebase, detects repeatable patterns only, produces draft context.

```bash
ctx scan
```

- Updates `.ctx/*.yaml` files
- Marks every inference with confidence: `observed`, `inferred`, `uncertain`
- Prevents false authority

### `ctx explain`

Converts raw analysis into human-readable synthesis. **This is the core value.**

```bash
ctx explain
ctx explain architecture
ctx explain conventions
```

Example output:
```
This codebase favors:
- Vertical feature folders over layers
- Explicit service boundaries
- Repository pattern for persistence
- Domain errors over exceptions
```

### `ctx inject`

Prepares context for AI. The translation layer — this is the moat.

```bash
ctx inject
ctx inject --task "Add auth middleware"
```

Outputs a clean, bounded context block:
```
Context:
- Use existing middleware pattern in /server/http
- Follow error handling via Result<T>
- No new dependencies
- Match naming conventions in auth/*
```

### `ctx diff` (future, paid-tier hook)

Shows architectural drift, convention changes, emerging patterns.

```bash
ctx diff
```

---

## Schema design

All files are YAML. Human-editable is the priority.

### `.ctx/manifest.yaml`

```yaml
name: my-project
language: typescript
framework: express
description: |  # optional, user-written
  Backend API for inventory management

generated_at: 2025-01-04T12:00:00Z
ctx_version: 0.1.0
```

### `.ctx/conventions.yaml`

```yaml
naming:
  files:
    style: kebab-case
    confidence: observed
  functions:
    style: camelCase
    confidence: observed
  classes:
    style: PascalCase
    confidence: observed

formatting:
  indent: 2 spaces
  quotes: single
  semicolons: false
  confidence: observed

imports:
  style: named
  order: [builtin, external, internal, relative]
  confidence: inferred

comments:
  jsdoc: rare
  inline: minimal
  confidence: inferred
```

### `.ctx/architecture.yaml`

```yaml
structure:
  pattern: vertical-features  # or: layered, modular, flat
  confidence: inferred
  evidence:
    - "src/features/* contains isolated domains"
    - "each feature has own routes, handlers, services"

boundaries:
  - name: features
    path: src/features/*
    responsibility: domain logic per feature
    confidence: observed
  - name: shared
    path: src/shared/*
    responsibility: cross-cutting utilities
    confidence: observed

patterns:
  persistence:
    style: repository
    confidence: inferred
    evidence:
      - "*.repository.ts files in each feature"
  error_handling:
    style: result-type  # or: exceptions, error-codes
    confidence: inferred
    evidence:
      - "Result<T, E> used in service returns"
  dependency_injection:
    style: constructor
    confidence: observed

data_flow:
  direction: handler → service → repository
  confidence: inferred
```

### `.ctx/exclusions.yaml`

```yaml
# Paths to ignore during scan
paths:
  - node_modules
  - dist
  - build
  - .git
  - "*.test.ts"
  - "*.spec.ts"
  - __mocks__

# Patterns that are noise, not convention
ignore_patterns:
  - generated files
  - vendored code
```

---

## MVP scope

### Analyze ONLY:
- Folder structure patterns
- File naming conventions
- Repeated abstractions (*.service.ts, *.repository.ts, etc.)
- Error handling style (exceptions vs Result types vs error codes)
- Dependency direction (what imports what)

### Explicitly NOT in v0:
- Runtime behavior
- Performance analysis
- Business logic correctness
- Cross-repo inference
- AI backend integration
- Sync/teams/plugins

---

## Technical approach

### Language choice

**Rust or Go preferred** for:
- Fast filesystem traversal
- Single binary distribution
- No runtime dependencies
- CLI ergonomics (clap for Rust, cobra for Go)

TypeScript acceptable if faster to prototype, but distribution story is weaker.

### Parsing strategy

Don't over-engineer. v0 needs:

1. **Filesystem walker** — respect .gitignore + exclusions.yaml
2. **Pattern matcher** — regex/glob for naming conventions
3. **AST parsing** — lightweight, language-specific
   - TypeScript: ts-morph or swc
   - Python: ast module
   - Go: go/ast
   - Start with ONE language (TypeScript recommended given your background)
4. **Heuristics engine** — rules that fire based on observations
5. **Synthesis layer** — turn raw data into human sentences

### Confidence scoring

Every inference needs confidence:
- `observed`: directly seen in code (file naming, folder structure)
- `inferred`: derived from patterns (architecture style, error handling)
- `uncertain`: weak signal, needs user confirmation

### Output focus

The magic is in `ctx explain` and `ctx inject`.

`explain` must sound like a senior dev describing the codebase.  
`inject` must be paste-ready with zero editing.

If these suck, the product fails. Optimize here first.

---

## What NOT to build

- No web UI
- No cloud sync
- No AI backend (users paste into their own tools)
- No code generation
- No refactoring suggestions
- No "fix my code" features

This tool **observes, synthesizes, and explains**. That's it.

---

## Validation criteria

Run `ctx scan` on 5 real repos. Ask:
1. Does `ctx explain` sound *right*?
2. Would I paste `ctx inject` output into AI without editing?

If yes → working  
If no → fix synthesis, not parsing

---

## File structure (suggested)

```
ctx/
├── src/
│   ├── main.rs (or main.go / index.ts)
│   ├── commands/
│   │   ├── init.rs
│   │   ├── scan.rs
│   │   ├── explain.rs
│   │   └── inject.rs
│   ├── analysis/
│   │   ├── filesystem.rs
│   │   ├── patterns.rs
│   │   ├── conventions.rs
│   │   └── architecture.rs
│   ├── synthesis/
│   │   ├── explainer.rs
│   │   └── injector.rs
│   └── schema/
│       └── types.rs
├── .ctx/              # dogfood: use ctx on itself
├── Cargo.toml
└── README.md
```

---

## Implementation order

1. **`ctx init`** — trivial, but establishes the contract
2. **`ctx scan`** — filesystem + naming conventions only (skip AST initially)
3. **`ctx explain`** — hardest part, start with templates
4. **`ctx inject`** — format explain output for AI consumption

Get through this loop in <1 week. Then iterate on quality.

---

## Example session (what success looks like)

```bash
$ cd my-express-api
$ ctx init
Created .ctx/ directory

$ ctx scan
Scanning... 
Found 47 source files
Detected patterns: 12 observed, 5 inferred, 2 uncertain

$ ctx explain
This codebase favors:
- Vertical feature folders (src/features/*)
- Repository pattern for data access
- Result<T> for error handling (no thrown exceptions)
- Dependency injection via constructors
- kebab-case files, PascalCase classes

Uncertain:
- Testing strategy unclear (limited test files found)

$ ctx inject --task "Add rate limiting middleware"

## Context for AI

This is an Express.js API using TypeScript.

Architecture:
- Middleware lives in src/middleware/
- Follow existing pattern: single export, typed config
- See src/middleware/auth.middleware.ts for reference

Conventions:
- File: kebab-case (rate-limit.middleware.ts)
- Export: named, PascalCase function
- Errors: return Result<T>, don't throw

Constraints:
- No new dependencies without explicit approval
- Must include unit test in __tests__/

---

Ready to paste into Claude/ChatGPT/Cursor.
```

---

## Reminders for Claude Code

- Keep commands minimal — resist feature creep
- Human-readable output > technically correct output
- Confidence markers prevent false authority
- The moat is synthesis quality, not parsing sophistication
- Dogfood immediately: run ctx on the ctx repo itself
