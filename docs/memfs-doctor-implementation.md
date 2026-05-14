# MemFS Doctor Implementation Spec

## Milestone 1

Build a read-only CLI that diagnoses real Letta MemFS clones on disk and emits a compact health report.

This milestone is intentionally conservative:

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

## Checks in Milestone 1

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
- working tree dirty state
- ahead / behind counts if available
- detached HEAD detection
- merge state detection
- remote configured

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
- `GIT_MERGE_IN_PROGRESS`
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

## Non-goals for this milestone

- automatic repair
- backup archive creation
- restore workflows
- server-side validation
- branch rewrite heuristics beyond what local git exposes simply

## Milestone 2

After Milestone 1 works on the real agent:

- add backup bundle generation
- add local/remote divergence detail
- add force-push suspicion checks
- add structured recovery suggestions
- compare with `letta memory backup` and `restore`
