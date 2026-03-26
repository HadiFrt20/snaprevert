<div align="center">

# snaprevert

**The undo button for AI-assisted coding.**

Auto-snapshots your project every time AI touches your code.
Instant rollback when things break. Zero config.

*Claude Code adds auth, then breaks the project with a TypeScript refactor. snaprevert rolls it back instantly.*

![demo](demo.gif)

[![CI](https://github.com/HadiFrt20/snaprevert/actions/workflows/ci.yml/badge.svg)](https://github.com/HadiFrt20/snaprevert/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Tests](https://img.shields.io/badge/tests-194%20passing-brightgreen)

</div>

---

## The Problem

You're using Claude Code, Cursor, Copilot, or Aider. Each AI prompt touches 5-20 files. Something breaks. You have no checkpoint. Git requires discipline between prompts that nobody has in flow state.

**The result:** lost work, broken projects, and fear of experimenting.

## The Solution

```bash
npx snaprevert watch
```

That's it. snaprevert silently snapshots your project on every meaningful change. When the AI breaks something:

```bash
snaprevert list        # see what changed
snaprevert back 3      # go back to when it worked
```

Your project is restored in under 1 second. The rolled-back snapshots are preserved — you can selectively re-apply any of them.

## Install

```bash
npm install -g snaprevert
```

## Quick Start

```bash
# Start watching (set it and forget it)
snaprevert watch

# ... use your AI coding tool normally ...
# ... things break ...

# See all snapshots
snaprevert list

# See what changed in snapshot #5
snaprevert diff 5

# Go back to before snapshot #3
snaprevert back 3

# Changed your mind? Re-apply snapshot #5
snaprevert restore 5
```

## Commands

| Command | What it does |
|---------|-------------|
| `snaprevert watch` | Start auto-snapshotting on file changes |
| `snaprevert snap` | Create a manual snapshot (with optional `--label`) |
| `snaprevert list` | Show all snapshots with timestamps and labels |
| `snaprevert diff <#>` | Show exactly what changed in a snapshot |
| `snaprevert back <#>` | Roll back to before a snapshot |
| `snaprevert restore <#>` | Re-apply a rolled-back snapshot |
| `snaprevert status` | Show current state overview |
| `snaprevert config` | View/change settings |
| `snaprevert cleanup` | Prune old snapshots |

## How It Works

```
You code with AI
       |
       v
snaprevert watches your files (via chokidar)
       |
       v
Changes detected → debounce 3s → compute diffs → store snapshot
       |
       v
.snaprevert/snapshots/{timestamp}-{id}/
  ├── meta.json     (what changed, when, auto-label)
  ├── diffs/        (unified diffs for modified files)
  └── added/        (full content of new files)
```

- **Lightweight**: Stores diffs, not full copies. A day of heavy AI coding uses <10MB.
- **Non-destructive**: Rollbacks preserve rolled-back snapshots. Nothing is ever permanently deleted.
- **Fast**: Snapshot creation <100ms. Rollback <1s.

## Smart Defaults

- Ignores `node_modules`, `.git`, `build`, `dist`, `.next`, `.env` and everything in your `.gitignore`
- Groups rapid changes (3s debounce) into a single snapshot
- Auto-generates human-readable labels: *"modified auth.ts, added user.ts"*
- Skips files over 1MB
- Add `.snaprevertignore` for custom ignore patterns

## Configuration

```bash
snaprevert config                     # show all settings
snaprevert config debounce_ms 5000    # change debounce to 5s
snaprevert config --reset             # reset to defaults
```

| Setting | Default | Description |
|---------|---------|-------------|
| `debounce_ms` | `3000` | ms to wait before snapshotting |
| `retention_days` | `30` | auto-cleanup after N days |
| `max_snapshots` | `500` | max snapshots to keep |
| `max_file_size_kb` | `1024` | skip files larger than this |
| `auto_label` | `true` | auto-generate snapshot labels |

## Works With Everything

snaprevert is tool-agnostic. It watches your filesystem, not your AI tool.

- **Claude Code** - every prompt auto-snapshotted
- **Cursor** - every Composer/Tab change captured
- **GitHub Copilot** - every suggestion acceptance tracked
- **Aider** - every edit round preserved
- **Windsurf** - every Cascade change saved
- **Any AI tool** that writes to your filesystem

## Why not just use git?

**Git requires intent. snaprevert requires nothing.**

When you're in flow state with an AI tool, the loop is: prompt AI, review, prompt again, review, prompt again. Nobody stops to `git commit` between each prompt. By the time something breaks, you're 5-10 prompts deep with no checkpoint.

|                | Git                                          | snaprevert                  |
|----------------|----------------------------------------------|-----------------------------|
| When it saves  | When you remember to commit                  | Automatically, every change |
| Granularity    | Whatever you staged                          | Every AI prompt's changes   |
| Cognitive cost | Must decide what to commit & write a message | Zero — it's invisible       |
| Rollback UX    | git reflog, git reset, git stash...          | `snaprevert back 3`        |
| Target user    | Developers who commit frequently             | Anyone who doesn't          |

They're complementary, not competing. Git is for meaningful, curated history you push to a team. snaprevert is the continuous autosave between commits — like how Google Docs saves every keystroke but you still "publish" versions.

## FAQ

**Does it slow down my project?**
No. Snapshot creation takes <100ms and only runs after file changes settle (debounce). The watcher uses native OS file events with zero polling.

**How much disk space does it use?**
Minimal. snaprevert stores diffs, not full file copies. A full day of heavy AI coding typically uses <10MB.

**What if I accidentally roll back too far?**
Rolled-back snapshots are preserved, never deleted. Use `snaprevert restore <#>` to re-apply any of them.

**Can I use it alongside git?**
Yes. snaprevert ignores `.git/` and doesn't interfere with git in any way. They're complementary — snaprevert for rapid AI iterations, git for meaningful commits.

## Architecture

```
snaprevert/
  bin/snaprevert.js          # CLI entry (commander)
  src/
    commands/                 # 9 CLI commands
    storage/                  # Diff engine + snapshot store
    watcher/                  # Chokidar watcher + debounce buffer
    engine/                   # Rollback + restore algorithms
    formatter/                # Terminal output renderers
    utils/                    # Config, labels, hashing, timing
```

**3 runtime dependencies**: `commander`, `chalk`, `chokidar`.
**194 tests**: 122 unit + 36 integration + 36 UAT.
**Zero config required.**

## Contributing

```bash
git clone https://github.com/HadiFrt20/snaprevert.git
cd snaprevert
npm install
npm test              # run all 194 tests
npm run test:unit     # unit tests only
npm run lint          # ESLint
```

CI runs automatically on every PR: lint, tests across Node 18/20/22, integration tests, UAT tests, and coverage.

## License

MIT
