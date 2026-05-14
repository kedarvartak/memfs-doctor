# MemFS Doctor Implementation Spec

## Current milestone

Build a read-only CLI that diagnoses real Letta MemFS clones on disk and emits a compact health report with recovery suggestions.

The implementation remains intentionally conservative:

- no destructive repair
- no automatic git mutation
- no assumptions beyond validated on-disk invariants

## Real invariants observed on this machine

Agent inspected:

- `agent-9edb3aaa-735a-4db6-b9e0-dee86bcc8998`

Memory directory:

- `/home/kedar/.letta/agents/agent-9edb3aaa-735a-4db6-b9e0-dee86bcc8998/memory`

Observed structure:

- `.git/`
- `.letta/config.json`
- `system/human.md`
- `system/persona.md`

Observed built-in Letta signals:

- `letta memory status` returns only `dirty`, `aheadOfRemote`, and `summary`
- `letta memory diff` returns plain diff/no-changes output
- `letta memory tokens` reports token counts for `system/` files only

Observed config:

```json
{"version": 1}
```

Observed markdown format:

- YAML frontmatter present
- `description` field required in frontmatter
- body content follows after closing frontmatter delimiter

## CLI shape

Initial standalone command:

```text
node src/cli.mjs --memory-dir <path>
node src/cli.mjs --agent <agent-id>
node src/cli.mjs --agent <agent-id> --format json
```

This mirrors the future upstream target:

```text
letta memory doctor --agent <id>
```

## Checks currently implemented

### Filesystem checks

- memory directory exists
- memory directory is readable
- `.git` exists
- `.letta/config.json` exists
- `system/` exists
- `system/persona.md` exists
- `system/human.md` exists

### Git checks

- repo is a valid git working tree
- current branch is readable
- upstream branch exists
- remote URL is readable
- working tree dirty state
- ahead / behind counts if available
- local/remote divergence detection
- detached HEAD detection
- merge state detection
- remote configured
- force-push suspicion from remote-tracking reflog when available

### Content checks

- `.letta/config.json` parses as JSON
- config version exists
- markdown files start with frontmatter
- frontmatter parses as simple key/value YAML subset
- `description` field exists and is non-empty
- file body is non-empty
- conflict markers are absent

### Discovery checks

- recursively inspect markdown files under `system/`
- recursively inspect markdown files under any non-hidden top-level directories
- ignore `.git/`

## Output model

### Top-level fields

- `status`: `healthy` | `warning` | `error`
- `memoryDir`
- `agentId`
- `branch`
- `upstream`
- `summary`
- `findings`
- `suggestions`
- `severityCounts`
- `checkedFiles`
- `git`

### Finding fields

- `severity`: `info` | `warning` | `error`
- `code`
- `message`
- `path` optional
- `details` optional

## Initial finding codes

- `MEMORY_DIR_MISSING`
- `NOT_A_GIT_REPO`
- `GIT_DETACHED_HEAD`
- `GIT_DIRTY_WORKTREE`
- `GIT_NO_REMOTE`
- `GIT_NO_UPSTREAM`
- `GIT_AHEAD_OF_REMOTE`
- `GIT_BEHIND_REMOTE`
- `GIT_DIVERGED_FROM_REMOTE`
- `GIT_MERGE_IN_PROGRESS`
- `GIT_FORCE_PUSH_SUSPECTED`
- `CONFIG_MISSING`
- `CONFIG_INVALID_JSON`
- `CONFIG_VERSION_MISSING`
- `SYSTEM_DIR_MISSING`
- `REQUIRED_FILE_MISSING`
- `FRONTMATTER_MISSING`
- `FRONTMATTER_UNCLOSED`
- `DESCRIPTION_MISSING`
- `FILE_EMPTY`
- `CONFLICT_MARKERS_PRESENT`

## Exit codes

- `0`: healthy
- `1`: warning-level findings only
- `2`: error-level findings

## Implementation notes

- use Node built-ins only
- execute git through `child_process.spawnSync`
- parse `git status --porcelain=2 --branch`
- parse frontmatter with a narrow parser, not a full YAML dependency
- keep the code small and inspectable

## What is verified already

- healthy result on the real Letta MemFS clone
- conflict-marker detection on an isolated copied fixture
- malformed frontmatter detection on an isolated copied fixture
- true git divergence detection on a synthetic remote/local sandbox
- JSON report export to `/tmp`

## Non-goals in the current implementation

- automatic repair
- backup archive creation
- restore workflows
- server-side validation

## Next milestone

- add backup bundle generation
- add report bundling for support escalation
- add optional safe frontmatter normalization
- compare outputs directly with `letta memory backup` and `restore`
