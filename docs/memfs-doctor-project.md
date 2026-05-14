# MemFS Doctor + Recovery Toolkit

## Goal

Build a reliability layer for Letta Code's MemFS that detects broken memory repository state early, explains the problem clearly, and provides safe recovery paths.

This project is aimed at Letta's core product risk:

- persistent memory is their main differentiator
- MemFS is git-backed and concurrency-heavy
- trust drops quickly if memory is corrupted, rewritten, orphaned, or silently diverges

## Why this is useful to Letta

Letta's public product direction is centered on:

- long-lived agents
- git-backed context repositories
- concurrent subagents
- learning through memory edits over time

That makes memory correctness and recovery part of the product, not just an implementation detail.

MemFS Doctor strengthens that promise by adding:

- preflight validation before agent work starts
- post-failure diagnostics after crashes or sync issues
- safe backup and rollback flows
- structured health reports for users and support engineers

## Product hypothesis

If Letta users get a deterministic memory health check and guided recovery workflow, then:

- MemFS failures become easier to detect
- user trust improves because memory state becomes inspectable
- support burden drops because failures become classifiable
- Letta can ship memory-heavy features with lower operational risk

## Scope

The first version should be a read-mostly diagnostic and recovery assistant.

It should not attempt broad automatic mutation on day one.

## MVP

### 1. Health check command

Add a `memfs doctor` style command or standalone toolkit command that:

- locates the local MemFS clone
- validates that the directory is a git repository
- checks branch / HEAD sanity
- checks for uncommitted changes
- checks upstream / remote availability
- checks for divergence between local and remote refs
- checks for force-push / rewritten history signals
- checks for merge conflict markers in files
- checks for malformed or missing memory file frontmatter
- checks for missing required descriptions
- checks for oversized or suspiciously empty memory files
- checks for orphan files in skill / memory directories
- emits a machine-readable and human-readable report

### 2. Snapshot and backup flow

Provide a safe snapshot operation before any repair:

- create timestamped backup bundle
- record current git refs
- record repo status
- optionally archive the memory directory

### 3. Guided recovery suggestions

For each detected class of failure, provide deterministic next steps:

- local dirty state
- local/remote divergence
- rewritten remote history
- merge conflict state
- malformed markdown/frontmatter
- orphan skill files
- missing system files

### 4. Safe repair primitives

Only add limited repair actions in MVP:

- create backup
- normalize frontmatter where the fix is deterministic
- quarantine malformed files into a recovery folder
- rebuild derived indexes or caches if Letta uses them locally
- export a recovery report for manual support escalation

## Non-goals for MVP

- redesigning MemFS architecture
- changing Letta's memory model
- adding a full UI
- solving all sync bugs automatically
- force-resetting history without explicit user approval

## Primary failure modes to target

The toolkit should be designed around failure classes visible from Letta's public architecture and issue surface:

- remote history rewritten or force-pushed
- concurrent subagent writes causing divergence
- crash during sync or background task
- orphaned files after partial backfill or migration
- malformed markdown/frontmatter after agent edits
- local repo left in unresolved merge/conflict state
- background scheduler tasks depending on broken memory state

## User stories

### User story 1

As a Letta Code user, I want to know whether my agent memory is healthy before I start working, so I do not continue on top of corrupted context.

### User story 2

As a support engineer, I want a compact memory health report so I can classify failures without asking the user for raw git internals.

### User story 3

As a power user running multiple conversations and subagents, I want early warning when my memory repo diverges or enters conflict state.

### User story 4

As a developer on Letta, I want reproducible fixtures for memory corruption and recovery so regressions are caught before release.

## Proposed architecture

### Layer 1: inspector

Read-only checks over:

- filesystem layout
- markdown/frontmatter structure
- git state
- config/state metadata when available

### Layer 2: classifier

Map raw findings into failure classes:

- healthy
- warning
- recoverable failure
- unsafe / manual intervention required

### Layer 3: recovery planner

Generate suggested next steps with explicit safety level:

- safe automatic action
- manual review required
- stop and escalate

### Layer 4: reporter

Output:

- CLI summary
- JSON report
- optional support bundle

## Suggested command surface

This should align with Letta's existing CLI surface.

Observed on Letta Code `0.25.8`, the CLI already includes:

- `letta memory status`
- `letta memory diff`
- `letta memory resolve`
- `letta memory backup`
- `letta memory backups`
- `letta memory restore`
- `letta memory export`
- `letta memory pull`
- `letta memory tokens`

So the most upstreamable path is to extend that family:

```text
letta memory doctor --agent <id>
letta memory doctor --agent <id> --format json
letta memory doctor --agent <id> --apply-safe-fixes
letta memory doctor --agent <id> --export-report <dir>
```

If upstream integration is hard, a standalone developer tool is still useful as a proof of value, but it should preserve compatibility with the existing `letta memory ...` concepts.

## Success criteria

The project is successful if it can:

- identify unhealthy MemFS states deterministically
- explain failure causes in plain language
- avoid destructive recovery behavior by default
- generate reproducible outputs useful to users and Letta engineers
- catch at least one real-world failure class before the agent continues working

## Risks

- Letta's internal MemFS invariants may be broader than public docs suggest
- some recovery flows may require server-side support, not just local fixes
- standalone tooling may have limited reach unless integrated into Letta Code commands
- automatic repair can be dangerous if invariants are incomplete

## Recommended implementation sequence

1. Build a fixture-based offline validator against mocked MemFS repos.
2. Add a report format and failure classifier.
3. Add non-destructive backup support.
4. Validate against a real Letta Code agent using the Letta API.
5. Add narrowly scoped safe repairs.
6. Package as an upstreamable contribution.

## Sources used

- Letta Code overview: https://docs.letta.com/letta-code/
- Letta Code quickstart: https://docs.letta.com/letta-code/quickstart/
- Letta Code memory docs: https://docs.letta.com/letta-code/memory/
- Letta Code configuration: https://docs.letta.com/letta-code/configuration/
- Letta Code slash commands: https://docs.letta.com/letta-code/slash-commands/
- Context Repositories blog: https://www.letta.com/blog/context-repositories
