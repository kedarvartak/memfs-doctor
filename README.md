<div align="center">

# MemFS Doctor Toolkit

![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![Git](https://img.shields.io/badge/Git-Repository%20Diagnostics-blue)
![MemFS](https://img.shields.io/badge/MemFS-Validation-orange)
![Support Bundles](https://img.shields.io/badge/Support-Bundles-purple)

Read-only diagnostic tooling for Letta MemFS repositories.

</div>

Read-only diagnostic tooling for Letta MemFS repositories.

## Background

MemFS introduces git-backed persistence for long-lived agent memory. That means the memory layer behaves like a distributed repository and can experience the same operational problems as any git-based system:

* local and remote divergence
* interrupted merges or rebases
* malformed files
* orphaned memory state
* conflict markers committed into memory
* force-push or sync inconsistencies
* uncertainty around whether recovery actions are safe

Several recent issues in [Letta Code](https://github.com/letta-ai/letta-code?utm_source=chatgpt.com) exposed these failure modes in practice:

* [#2212 — MemFS git history repeatedly force-pushed by server, wiping agent memory](https://github.com/letta-ai/letta-code/issues/2212?utm_source=chatgpt.com)
* [#2153 — Memfs sync wipes agent block_ids, description, and git_enabled on every sync cycle](https://github.com/letta-ai/letta-code/issues/2153?utm_source=chatgpt.com)
* [#2185 — Memfs Sync Wipes block_ids on Every App Connection](https://github.com/letta-ai/letta-code/issues/2185?utm_source=chatgpt.com)
* [#2264 — Server backfill creates orphan skills/<name>.md alongside skills/<name>/SKILL.md directories](https://github.com/letta-ai/letta-code/issues/2264?utm_source=chatgpt.com)

Letta already exposes useful memory operations such as:

* `letta memory status`
* `letta memory diff`
* `letta memory backup`
* `letta memory restore`

Those commands are useful for interacting with memory, but they do not provide a structured way to inspect repository health, classify failure modes, or collect debugging evidence before attempting recovery.

This project focuses on that diagnostic layer.

---

## Approach

MemFS Doctor treats the memory repository as an inspectable system rather than attempting automatic repair.

The toolkit performs three categories of work:

1. Repository validation
   Confirms that the MemFS clone, git metadata, and required memory structures are present and internally consistent.

2. Failure classification
   Detects and categorizes operational issues such as divergence, unresolved merge conflicts, malformed frontmatter, missing metadata, and in-progress git operations.

3. Evidence collection
   Exports reproducible support bundles containing repository state, git metadata, logs, and a complete memory snapshot for debugging or recovery workflows.

The goal is to make memory failures understandable before any destructive action is taken.

---

## Current checks

The current implementation validates:

### Git state

* repository validity
* current branch detection
* upstream tracking configuration
* remote URL resolution
* dirty worktree detection
* ahead / behind detection
* divergence detection
* merge or rebase in progress
* force-push suspicion from remote-tracking reflog state

### MemFS structure

* required memory directories exist
* `.letta/config.json` parses correctly
* markdown frontmatter exists
* required `description` metadata exists
* markdown body is non-empty
* merge conflict markers are absent

### Diagnostics and recovery support

* finding classification
* recovery suggestion generation
* JSON report export
* support bundle export with repository snapshot

---

## Tested against

The toolkit has been validated against:

* a real Letta Code MemFS-enabled agent
* isolated malformed and conflict fixtures
* synthetic divergence sandboxes

---

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

Export support bundle:

```bash
node ./src/cli.mjs --agent <agent-id> --export-bundle /tmp/memfs-bundles
```

---

## Example outputs

Healthy repository:

```text
Status: healthy
Branch: main
Upstream: origin/main
Findings: none
```

Conflict state:

```text
WARNING GIT_DIRTY_WORKTREE
ERROR CONFLICT_MARKERS_PRESENT [system/persona.md]
```

Malformed frontmatter:

```text
WARNING GIT_DIRTY_WORKTREE
ERROR FRONTMATTER_UNCLOSED [system/human.md]
```

Diverged repository:

```text
ERROR GIT_DIVERGED_FROM_REMOTE
```

Support bundle export:

```text
Bundle written to: /tmp/memfs-bundles/memfs-doctor-bundle-<timestamp>
```

---

## Support bundle contents

Exported bundles include:

* `report.json`
* `git-status.txt`
* `git-log.txt`
* `git-remotes.txt`
* `git-reflog-origin-main.txt`
* `memory-snapshot/`

These artifacts are intended to support debugging, incident analysis, and recovery workflows without mutating the underlying memory repository.

---

## Documentation

* [Project spec](./docs/memfs-doctor-project.md)
* [Testing plan](./docs/memfs-doctor-testing.md)
* [Implementation spec](./docs/memfs-doctor-implementation.md)
