# MemFS Doctor Toolkit

Read-only diagnostic toolkit for Letta MemFS clones.

## Current status

Milestone 1 is scaffolded and working against:

- a real Letta Code `0.25.8` MemFS clone
- isolated broken fixtures copied from the real clone

Current checks:

- memory directory exists
- git repository is valid
- branch and upstream are readable
- dirty worktree detection
- merge/rebase in-progress detection
- required MemFS paths exist
- `.letta/config.json` parses
- markdown frontmatter exists
- `description` exists in frontmatter
- markdown body is non-empty
- merge conflict markers are absent

## Usage

Inspect by memory directory:

```bash
node ./src/cli.mjs --memory-dir ~/.letta/agents/<agent-id>/memory
```

Inspect by agent id:

```bash
node ./src/cli.mjs --agent <agent-id>
```

JSON output:

```bash
node ./src/cli.mjs --agent <agent-id> --format json
```

## Verified examples

Healthy real MemFS clone:

```text
Status: healthy
Branch: main
Upstream: origin/main
Findings: none
```

Broken conflict fixture:

```text
WARNING GIT_DIRTY_WORKTREE
ERROR CONFLICT_MARKERS_PRESENT [system/persona.md]
```

Broken malformed frontmatter fixture:

```text
WARNING GIT_DIRTY_WORKTREE
ERROR FRONTMATTER_UNCLOSED [system/human.md]
```

## Docs

- [Project spec](./docs/memfs-doctor-project.md)
- [Testing plan](./docs/memfs-doctor-testing.md)
- [Implementation spec](./docs/memfs-doctor-implementation.md)
