# MemFS Doctor Testing Plan

## Short answer

Yes, we need real Letta product testing before claiming this works.

More specifically:

- **CLI testing is required**
- **Desktop app testing is optional**
- **Docker-only testing is not sufficient for MemFS**

Why:

- Letta's docs say MemFS is available in Letta Code `0.15+`
- all new agents have MemFS enabled by default
- MemFS is available through the Letta API
- if you use a Docker server, the agent uses the legacy memory blocks system instead

That means the real validation path is Letta Code authenticated against Letta's hosted API, not just a local Docker server.

## Testing goals

We need to prove four things:

1. The toolkit can detect healthy MemFS state correctly.
2. The toolkit can detect intentionally broken MemFS state correctly.
3. The toolkit does not damage healthy memory repos.
4. The toolkit remains useful against real Letta Code agent state, not just mocks.

## Test strategy

Use three layers of testing.

### Layer 1: fixture tests

These are local, deterministic, and fast.

We create fake MemFS git repos with controlled failure cases:

- clean healthy repo
- dirty working tree
- missing frontmatter
- missing `description`
- merge conflict markers in markdown
- detached HEAD
- local/remote divergence
- rewritten remote history simulation
- orphan files in memory/skill directories
- empty required system files

Purpose:

- validate parsers
- validate git-state classification
- validate report output
- validate recovery planning

### Layer 2: integration tests against local git repos

These exercise the toolkit against real git operations on temp directories:

- create repo
- create bare remote
- clone local MemFS working copy
- simulate divergence
- simulate force-push
- simulate crash-like interrupted state where possible

Purpose:

- confirm our git heuristics are real, not mocked
- verify backup logic
- verify repair actions stay non-destructive

### Layer 3: manual product validation with Letta Code

This is the required final stage.

Purpose:

- verify our assumptions about actual MemFS layout
- confirm local memory clone path and file conventions
- validate that reports are understandable in real usage
- test on a live agent with real `/init`, `/remember`, and background memory activity

## Required environment

### Minimum

- Node.js 18+
- `npm`
- `git`
- a Letta account
- Letta Code CLI installed via:

```bash
npm install -g @letta-ai/letta-code
```

Validated locally during setup:

- Node.js `v22.22.0`
- npm `10.9.4`
- git `2.54.0`
- Letta Code CLI `0.25.8`

### Recommended

- a disposable test project directory
- one dedicated Letta test agent
- one secondary agent for comparison
- a shell script or Make target to run local test fixtures

### Optional

- Letta desktop app for observing the same agent in another client

## Product setup steps

### 1. Install Letta Code CLI

Use the official quickstart flow:

```bash
npm install -g @letta-ai/letta-code
```

### 2. Authenticate

Run:

```bash
letta
```

Observed on Letta Code `0.25.8`, this opens a device/browser login flow:

- the CLI prompts `Login to Letta Code`
- after confirmation it displays a short authorization code
- if the browser does not open, it prints a URL in this format:

```text
https://app.letta.com/oauth/device?user_code=<CODE>
```

This is the manual step that cannot be completed purely through local automation.

### 3. Create a disposable project

Example:

```bash
mkdir letta-memfs-doctor-sandbox
cd letta-memfs-doctor-sandbox
git init
printf "# sandbox\n" > README.md
git add .
git commit -m "init"
```

### 4. Start a fresh Letta agent

Inside the sandbox directory:

```bash
letta
```

Then create or select a dedicated test agent.

### 5. Bootstrap memory

In Letta Code, run:

```text
/init
```

Then confirm the local memory clone appears under the documented path:

```text
~/.letta/agents/<your-agent-id>/memory
```

## Real-world manual test cases

### Case A: healthy baseline

Steps:

1. Create new agent.
2. Run `/init`.
3. Ask a few normal questions.
4. Run our doctor command.

Expected:

- health status is healthy
- no destructive action suggested
- repo metadata resolves correctly
- existing `letta memory status` and `letta memory diff` outputs remain consistent with our diagnosis

### Case B: dirty working tree

Steps:

1. Edit one memory markdown file manually without committing.
2. Run doctor.

Expected:

- warning or recoverable failure
- exact changed files listed
- backup suggestion shown before repair

### Case C: malformed frontmatter

Steps:

1. Break YAML/frontmatter in one memory file.
2. Run doctor.

Expected:

- malformed file detected
- file path identified
- safe quarantine or normalization plan suggested

### Case D: merge conflict markers

Steps:

1. Introduce `<<<<<<<`, `=======`, `>>>>>>>` markers in a memory file.
2. Run doctor.

Expected:

- merge-conflict classification
- no automatic destructive rewrite by default

### Case E: local/remote divergence

Steps:

1. Create controlled git divergence using a temp remote or by exercising multiple clones if feasible.
2. Run doctor.

Expected:

- divergence detected
- local and remote refs summarized
- recovery plan explains safe next step

### Case F: remote history rewrite

Steps:

1. In a controlled test repo, simulate a force-push or rewritten remote branch.
2. Run doctor.

Expected:

- history rewrite suspicion detected
- report marked high severity
- restore/snapshot guidance produced

### Case G: real Letta usage after memory activity

Steps:

1. Use `/remember` several times.
2. Create a new conversation with `--new` or `/new`.
3. Continue working so the same agent accumulates memory.
4. Run doctor.

Expected:

- still healthy
- no false positives due to ordinary memory churn

## Existing Letta command surface to compare against

Because Letta already ships memory operations, our doctor output should be checked against these built-ins where relevant:

```bash
letta memory status --agent <agent-id>
letta memory diff --agent <agent-id>
letta memory backup --agent <agent-id>
letta memory backups --agent <agent-id>
letta memory restore --agent <agent-id> --from <backup> --force
letta memory export --agent <agent-id> --out <dir>
letta memory pull --agent <agent-id>
letta memory tokens --agent <agent-id> --format json
```

The project should avoid duplicating those commands blindly. It should add diagnosis and recovery classification that those commands currently do not provide.

## Immediate user action needed

Before we can inspect a real MemFS clone, you need to complete the first Letta login once on this machine.

Run:

```bash
letta
```

Then finish the browser authorization flow. After that, we can:

1. create a dedicated test agent
2. run `/init`
3. inspect the real memory directory layout
4. lock the implementation plan to actual MemFS files and git state

## What we do not need on day one

- full desktop app automation
- cloud deployment testing
- Docker server testing for MemFS validation

Docker testing can still be useful later for compatibility checks, but not as proof that MemFS Doctor works on real MemFS.

## Suggested acceptance criteria

We should not email Letta until all of the following are true:

- fixture tests cover the main failure classes
- at least one real Letta Code agent was tested end-to-end
- healthy baseline produces no scary false positives
- at least two broken states were reproduced and correctly diagnosed
- recovery actions are backup-first and non-destructive by default
- output is readable enough to paste into a GitHub issue or support thread

## What is already validated in this workspace

- real Letta Code `0.25.8` install and login flow
- real MemFS clone discovered under `~/.letta/agents/<agent-id>/memory`
- healthy baseline on the real agent
- isolated conflict fixture detection
- isolated malformed frontmatter detection
- synthetic local/remote divergence detection with a temp bare remote
- JSON report export to `/tmp/memfs-doctor-report`
- support bundle export to `/tmp/memfs-bundles`

## Recommended first milestone

Milestone 1 should focus on read-only diagnosis:

- repo discovery
- git health checks
- memory markdown validation
- JSON + text reports

Do not start with auto-repair.

## Sources used

- Letta Code quickstart: https://docs.letta.com/letta-code/quickstart/
- Letta Code CLI docs: https://docs.letta.com/letta-code/cli/
- Letta Code memory docs: https://docs.letta.com/letta-code/memory/
- Letta Code configuration: https://docs.letta.com/letta-code/configuration/
- Letta Code headless mode: https://docs.letta.com/letta-code/headless/
- Letta Code slash commands: https://docs.letta.com/letta-code/slash-commands/
