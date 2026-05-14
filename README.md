# MemFS Doctor Toolkit

Read-only diagnostic toolkit for Letta MemFS clones.

## Problem

Letta's core product claim is persistent, git-backed memory for long-lived agents.

That means MemFS failures are not just infra bugs. They directly affect user trust.

The gap in the current workflow is that Letta already exposes useful memory operations like:

- `letta memory status`
- `letta memory diff`
- `letta memory backup`
- `letta memory restore`

But those commands do not yet answer the harder operational questions:

- Is this memory repo structurally healthy?
- Did local and remote state diverge?
- Are memory markdown files malformed?
- Did a merge/conflict corrupt agent memory?
- What evidence should a user or support engineer capture before trying recovery?

That is the issue this project is aimed at.

## Solution

MemFS Doctor adds a diagnostic layer on top of Letta's existing memory workflows.

Instead of trying to auto-fix memory aggressively, it does three safer things:

1. validates the local MemFS repo and memory file structure
2. classifies failure modes like divergence, conflict markers, and malformed frontmatter
3. exports a support bundle with the report, git evidence, and a full repo snapshot

That makes MemFS failures easier to detect, explain, and debug without risking destructive repair.

## Current status

Milestone 1 is scaffolded and working against:

- a real Letta Code `0.25.8` MemFS clone
- isolated broken fixtures copied from the real clone

Current checks:

- memory directory exists
- git repository is valid
- branch and upstream are readable
- remote URL is readable
- dirty worktree detection
- ahead / behind detection
- divergence detection
- force-push suspicion from remote-tracking reflog
- merge/rebase in-progress detection
- required MemFS paths exist
- `.letta/config.json` parses
- markdown frontmatter exists
- `description` exists in frontmatter
- markdown body is non-empty
- merge conflict markers are absent
- recovery suggestions are generated from finding classes
- JSON report export works
- support bundle export works

## Why this matters

For a memory-first agent product, reliability work is product work.

If a user cannot tell whether their agent memory is healthy, they cannot safely trust:

- persistence across sessions
- concurrent subagent workflows
- memory edits over time
- recovery after sync or crash issues

MemFS Doctor narrows that trust gap by making the memory repo inspectable.

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

Support bundle:

```bash
node ./src/cli.mjs --agent <agent-id> --export-bundle /tmp/memfs-bundles
```

## Demo script

This is the shortest useful demo flow.

### 1. Show the healthy baseline on a real Letta agent

```bash
node ./src/cli.mjs --agent <agent-id>
```

Expected shape:

```text
Status: healthy
Branch: main
Upstream: origin/main
Findings: none
```

### 2. Export a support bundle

```bash
node ./src/cli.mjs --agent <agent-id> --export-bundle /tmp/memfs-bundles
```

Expected shape:

```text
Bundle written to: /tmp/memfs-bundles/memfs-doctor-bundle-<timestamp>
```

Then show the bundle contents:

```bash
find /tmp/memfs-bundles -maxdepth 3 -type f | sort
```

Point out:

- `report.json`
- `git-status.txt`
- `git-log.txt`
- `git-remotes.txt`
- `git-reflog-origin-main.txt`
- `memory-snapshot/`

### 3. Show one broken-state diagnosis

Conflict fixture:

```bash
node ./src/cli.mjs --memory-dir /tmp/memfs-fixture-conflict
```

Expected signal:

```text
ERROR CONFLICT_MARKERS_PRESENT [system/persona.md]
```

Or divergence fixture:

```bash
node ./src/cli.mjs --memory-dir /tmp/memfs-clone-a
```

Expected signal:

```text
ERROR GIT_DIVERGED_FROM_REMOTE
```

### 4. Explain the takeaway in one sentence

Suggested line:

`The tool doesn't try to guess a risky repair. It tells the user whether MemFS is healthy, what broke, and captures the right evidence before recovery.`

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

Broken divergence sandbox:

```text
ERROR GIT_DIVERGED_FROM_REMOTE
```

Support bundle output:

```text
Bundle written to: /tmp/memfs-bundles/memfs-doctor-bundle-<timestamp>
```

## One-line pitch

MemFS Doctor is a `letta memory doctor` style diagnostic and support-bundle tool for git-backed agent memory.

## Docs

- [Project spec](./docs/memfs-doctor-project.md)
- [Testing plan](./docs/memfs-doctor-testing.md)
- [Implementation spec](./docs/memfs-doctor-implementation.md)
- [Outreach memo](./docs/memfs-doctor-outreach.md)
- [Email draft](./docs/memfs-doctor-email.md)
