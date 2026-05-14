#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const args = {
    format: "text",
    memoryDir: null,
    agentId: null,
    exportReport: null,
    exportBundle: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--format") {
      args.format = argv[i + 1] ?? "text";
      i += 1;
    } else if (arg === "--memory-dir") {
      args.memoryDir = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--agent") {
      args.agentId = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--export-report") {
      args.exportReport = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--export-bundle") {
      args.exportBundle = argv[i + 1] ?? null;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.memoryDir && args.agentId) {
    args.memoryDir = path.join(os.homedir(), ".letta", "agents", args.agentId, "memory");
  }

  return args;
}

function printHelp() {
  console.log(`MemFS Doctor

Usage:
  memfs-doctor --memory-dir <path>
  memfs-doctor --agent <agent-id>
  memfs-doctor --agent <agent-id> --format json
  memfs-doctor --agent <agent-id> --export-report <file-or-dir>
  memfs-doctor --agent <agent-id> --export-bundle <dir>

Options:
  --memory-dir <path>         Inspect a specific MemFS directory
  --agent <id>                Resolve ~/.letta/agents/<id>/memory
  --format <text|json>        Output format (default: text)
  --export-report <path>      Write the JSON report to a file or directory
  --export-bundle <dir>       Write a support bundle with report, git metadata, and a repo snapshot
  -h, --help                  Show help
`);
}

function runGit(repoDir, args) {
  return spawnSync("git", ["-C", repoDir, ...args], {
    encoding: "utf8",
  });
}

function addFinding(findings, severity, code, message, extras = {}) {
  findings.push({ severity, code, message, ...extras });
}

function hasConflictMarkers(text) {
  return text.includes("<<<<<<<") || text.includes("=======") || text.includes(">>>>>>>");
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) {
    return { ok: false, code: "FRONTMATTER_MISSING", frontmatter: null, body: text };
  }

  const endMarker = "\n---\n";
  const endIndex = text.indexOf(endMarker, 4);
  if (endIndex === -1) {
    return { ok: false, code: "FRONTMATTER_UNCLOSED", frontmatter: null, body: "" };
  }

  const rawFrontmatter = text.slice(4, endIndex);
  const body = text.slice(endIndex + endMarker.length);
  const data = {};
  let currentKey = null;

  for (const line of rawFrontmatter.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      const [, key, value] = keyMatch;
      data[key] = value.trim();
      currentKey = key;
      continue;
    }

    const continuationMatch = line.match(/^\s+(.*)$/);
    if (continuationMatch && currentKey) {
      const appended = continuationMatch[1].trim();
      data[currentKey] = data[currentKey] ? `${data[currentKey]} ${appended}`.trim() : appended;
    }
  }

  return { ok: true, frontmatter: data, body };
}

function walkMarkdownFiles(memoryDir) {
  const results = [];
  for (const entry of fs.readdirSync(memoryDir, { withFileTypes: true })) {
    if (entry.name === ".git") {
      continue;
    }
    const entryPath = path.join(memoryDir, entry.name);
    if (entry.isDirectory()) {
      walkDir(entryPath, results);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(entryPath);
    }
  }
  return results.sort();
}

function walkDir(dir, results) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") {
      continue;
    }
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(entryPath, results);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(entryPath);
    }
  }
}

function relativePath(root, target) {
  return path.relative(root, target) || ".";
}

function summarizeSeverity(findings) {
  const counts = { info: 0, warning: 0, error: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

function getStatusFromFindings(findings) {
  if (findings.some((finding) => finding.severity === "error")) {
    return "error";
  }
  if (findings.some((finding) => finding.severity === "warning")) {
    return "warning";
  }
  return "healthy";
}

function buildSuggestions(findings) {
  const byCode = new Set(findings.map((finding) => finding.code));
  const suggestions = [];

  const add = (priority, title, action) => {
    suggestions.push({ priority, title, action });
  };

  if (byCode.has("GIT_MERGE_IN_PROGRESS") || byCode.has("CONFLICT_MARKERS_PRESENT")) {
    add(
      1,
      "Resolve active merge damage before resuming the agent",
      "Stop agent activity, inspect the conflicting markdown files, resolve the merge manually, and rerun the doctor before any push or pull.",
    );
  }

  if (byCode.has("GIT_DIVERGED_FROM_REMOTE") || byCode.has("GIT_FORCE_PUSH_SUSPECTED")) {
    add(
      1,
      "Treat remote history as unstable",
      "Export the current memory repo, capture `git log --graph --oneline --decorate --all`, and avoid hard resets until the divergence source is understood.",
    );
  }

  if (byCode.has("GIT_DIRTY_WORKTREE")) {
    add(
      2,
      "Preserve local edits before syncing",
      "Snapshot the repo state or commit/quarantine local changes before running `letta memory pull` or any manual git sync command.",
    );
  }

  if (
    byCode.has("FRONTMATTER_MISSING") ||
    byCode.has("FRONTMATTER_UNCLOSED") ||
    byCode.has("DESCRIPTION_MISSING") ||
    byCode.has("FILE_EMPTY")
  ) {
    add(
      2,
      "Repair malformed memory documents conservatively",
      "Restore the frontmatter header, keep a non-empty `description`, and preserve the original file in a recovery copy before editing.",
    );
  }

  if (byCode.has("CONFIG_INVALID_JSON") || byCode.has("CONFIG_MISSING")) {
    add(
      1,
      "Restore MemFS metadata before continuing",
      "Recover `.letta/config.json` from a healthy backup or export before trusting any further memory operations.",
    );
  }

  if (byCode.has("GIT_NO_REMOTE") || byCode.has("GIT_NO_UPSTREAM")) {
    add(
      3,
      "Confirm sync topology",
      "Verify that the local MemFS clone still points at the expected remote and upstream branch used by Letta.",
    );
  }

  if (!suggestions.length) {
    add(3, "No action required", "The repository looks healthy. Keep this report as the baseline for future comparisons.");
  }

  return suggestions.sort((a, b) => a.priority - b.priority);
}

function maybeAddGitFindingFromStatus(result, findings, line) {
  if (line.startsWith("# branch.head ")) {
    result.branch = line.slice("# branch.head ".length).trim();
    if (result.branch === "(detached)") {
      addFinding(findings, "error", "GIT_DETACHED_HEAD", "Repository is in detached HEAD state.");
    }
    return;
  }

  if (line.startsWith("# branch.upstream ")) {
    result.upstream = line.slice("# branch.upstream ".length).trim();
    return;
  }

  if (line.startsWith("# branch.ab ")) {
    const match = line.match(/\+(\d+)\s+\-(\d+)/);
    if (!match) {
      return;
    }

    const ahead = Number(match[1]);
    const behind = Number(match[2]);
    result.git.ahead = ahead;
    result.git.behind = behind;

    if (ahead > 0 && behind > 0) {
      addFinding(
        findings,
        "error",
        "GIT_DIVERGED_FROM_REMOTE",
        `Local branch diverged from upstream (${ahead} ahead, ${behind} behind).`,
        { details: { ahead, behind } },
      );
      return;
    }

    if (ahead > 0) {
      addFinding(findings, "warning", "GIT_AHEAD_OF_REMOTE", `Local branch is ahead of upstream by ${ahead} commit(s).`, { details: { ahead } });
    }
    if (behind > 0) {
      addFinding(findings, "warning", "GIT_BEHIND_REMOTE", `Local branch is behind upstream by ${behind} commit(s).`, { details: { behind } });
    }
    return;
  }

  if (!line.startsWith("# ")) {
    addFinding(findings, "warning", "GIT_DIRTY_WORKTREE", "Working tree has uncommitted changes.");
  }
}

function inspectForcePushSuspicion(memoryDir, findings, result) {
  if (!result.upstream) {
    return;
  }

  const reflog = runGit(memoryDir, ["reflog", "show", "--format=%gs", result.upstream, "-n", "8"]);
  if (reflog.status !== 0) {
    return;
  }

  const entries = reflog.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  result.git.reflogHints = entries;

  const forcedUpdate = entries.find((line) => /forced-update/i.test(line));
  if (forcedUpdate) {
    addFinding(
      findings,
      "error",
      "GIT_FORCE_PUSH_SUSPECTED",
      "Remote-tracking branch reflog shows a forced update.",
      { details: { reflogEntry: forcedUpdate } },
    );
  }
}

function inspect(memoryDir, agentId = null) {
  const findings = [];
  const result = {
    status: "healthy",
    memoryDir,
    agentId,
    branch: null,
    upstream: null,
    summary: "",
    findings,
    suggestions: [],
    checkedFiles: [],
    config: null,
    git: {
      ahead: 0,
      behind: 0,
      remote: null,
      mergeInProgress: false,
      reflogHints: [],
    },
  };

  if (!memoryDir || !fs.existsSync(memoryDir)) {
    addFinding(findings, "error", "MEMORY_DIR_MISSING", "Memory directory does not exist.", {
      path: memoryDir ?? null,
    });
    result.status = "error";
    result.summary = "Memory directory missing.";
    result.suggestions = buildSuggestions(findings);
    return result;
  }

  const requiredPaths = [".git", ".letta/config.json", "system", "system/persona.md", "system/human.md"];
  for (const rel of requiredPaths) {
    const absolute = path.join(memoryDir, rel);
    if (!fs.existsSync(absolute)) {
      addFinding(findings, "error", "REQUIRED_FILE_MISSING", `Required path missing: ${rel}`, {
        path: rel,
      });
    }
  }

  const gitCheck = runGit(memoryDir, ["rev-parse", "--is-inside-work-tree"]);
  if (gitCheck.status !== 0 || gitCheck.stdout.trim() !== "true") {
    addFinding(findings, "error", "NOT_A_GIT_REPO", "Directory is not a valid git working tree.");
  } else {
    const status = runGit(memoryDir, ["status", "--porcelain=2", "--branch"]);
    if (status.status === 0) {
      const lines = status.stdout.split("\n").filter(Boolean);
      for (const line of lines) {
        maybeAddGitFindingFromStatus(result, findings, line);
      }
    }

    const remoteCheck = runGit(memoryDir, ["remote", "get-url", "origin"]);
    if (remoteCheck.status !== 0) {
      addFinding(findings, "warning", "GIT_NO_REMOTE", "No git remote is configured.");
    } else {
      result.git.remote = remoteCheck.stdout.trim();
    }

    if (!result.upstream) {
      addFinding(findings, "warning", "GIT_NO_UPSTREAM", "No upstream branch is configured.");
    }

    result.git.mergeInProgress =
      fs.existsSync(path.join(memoryDir, ".git", "MERGE_HEAD")) ||
      fs.existsSync(path.join(memoryDir, ".git", "rebase-merge")) ||
      fs.existsSync(path.join(memoryDir, ".git", "rebase-apply"));

    if (result.git.mergeInProgress) {
      addFinding(findings, "error", "GIT_MERGE_IN_PROGRESS", "Git merge or rebase appears to be in progress.");
    }

    inspectForcePushSuspicion(memoryDir, findings, result);
  }

  const configPath = path.join(memoryDir, ".letta", "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      result.config = config;
      if (typeof config.version === "undefined") {
        addFinding(findings, "warning", "CONFIG_VERSION_MISSING", "MemFS config version is missing.");
      }
    } catch {
      addFinding(findings, "error", "CONFIG_INVALID_JSON", "MemFS config JSON is invalid.", {
        path: ".letta/config.json",
      });
    }
  } else {
    addFinding(findings, "error", "CONFIG_MISSING", "MemFS config file is missing.", {
      path: ".letta/config.json",
    });
  }

  const markdownFiles = walkMarkdownFiles(memoryDir);
  result.checkedFiles = markdownFiles.map((file) => relativePath(memoryDir, file));

  for (const file of markdownFiles) {
    const rel = relativePath(memoryDir, file);
    const text = fs.readFileSync(file, "utf8");

    if (!text.trim()) {
      addFinding(findings, "warning", "FILE_EMPTY", "Markdown file is empty.", {
        path: rel,
      });
      continue;
    }

    if (hasConflictMarkers(text)) {
      addFinding(findings, "error", "CONFLICT_MARKERS_PRESENT", "Merge conflict markers detected.", {
        path: rel,
      });
    }

    const parsed = parseFrontmatter(text);
    if (!parsed.ok) {
      addFinding(findings, "error", parsed.code, "Invalid or missing markdown frontmatter.", {
        path: rel,
      });
      continue;
    }

    if (!parsed.frontmatter.description) {
      addFinding(findings, "error", "DESCRIPTION_MISSING", "Frontmatter description is missing.", {
        path: rel,
      });
    }

    if (!parsed.body.trim()) {
      addFinding(findings, "warning", "FILE_EMPTY", "Markdown body is empty.", {
        path: rel,
      });
    }
  }

  result.status = getStatusFromFindings(findings);
  result.severityCounts = summarizeSeverity(findings);
  result.suggestions = buildSuggestions(findings);

  if (result.status === "healthy") {
    result.summary = "MemFS repository looks healthy.";
  } else if (result.status === "warning") {
    result.summary = "MemFS repository has warnings but no hard failures.";
  } else {
    result.summary = "MemFS repository has blocking integrity issues.";
  }

  return result;
}

function formatText(report) {
  const lines = [];
  lines.push(`Status: ${report.status}`);
  lines.push(`Memory dir: ${report.memoryDir}`);
  if (report.agentId) {
    lines.push(`Agent: ${report.agentId}`);
  }
  if (report.branch) {
    lines.push(`Branch: ${report.branch}`);
  }
  if (report.upstream) {
    lines.push(`Upstream: ${report.upstream}`);
  }
  if (report.git?.remote) {
    lines.push(`Remote: ${report.git.remote}`);
  }
  lines.push(`Summary: ${report.summary}`);
  if (report.severityCounts) {
    lines.push(`Counts: ${report.severityCounts.error} error, ${report.severityCounts.warning} warning, ${report.severityCounts.info} info`);
  }

  if (!report.findings.length) {
    lines.push("Findings: none");
  } else {
    lines.push("Findings:");
    for (const finding of report.findings) {
      const location = finding.path ? ` [${finding.path}]` : "";
      lines.push(`- ${finding.severity.toUpperCase()} ${finding.code}${location}: ${finding.message}`);
    }
  }

  if (report.suggestions?.length) {
    lines.push("Suggestions:");
    for (const suggestion of report.suggestions) {
      lines.push(`- P${suggestion.priority} ${suggestion.title}: ${suggestion.action}`);
    }
  }

  return lines.join("\n");
}

function exitCodeForStatus(status) {
  if (status === "healthy") {
    return 0;
  }
  if (status === "warning") {
    return 1;
  }
  return 2;
}

function resolveExportPath(targetPath) {
  const absolute = path.resolve(targetPath);
  if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
    return path.join(absolute, "memfs-doctor-report.json");
  }
  if (targetPath.endsWith(path.sep)) {
    fs.mkdirSync(absolute, { recursive: true });
    return path.join(absolute, "memfs-doctor-report.json");
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  return absolute;
}

function exportReport(targetPath, report) {
  const outputPath = resolveExportPath(targetPath);
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:]/g, "-").replace(/\..+/, "Z");
}

function ensureDirectory(targetPath) {
  const absolute = path.resolve(targetPath);
  fs.mkdirSync(absolute, { recursive: true });
  return absolute;
}

function writeTextFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

function gitOutput(repoDir, args) {
  const result = runGit(repoDir, args);
  if (result.status !== 0) {
    return `COMMAND: git -C ${repoDir} ${args.join(" ")}\nEXIT: ${result.status}\nSTDERR:\n${result.stderr || ""}`;
  }
  return result.stdout || "";
}

function exportBundle(targetDir, report) {
  const rootDir = ensureDirectory(targetDir);
  const bundleDir = path.join(rootDir, `memfs-doctor-bundle-${timestampForPath()}`);
  fs.mkdirSync(bundleDir, { recursive: true });

  const reportPath = path.join(bundleDir, "report.json");
  writeTextFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const metadataLines = [
    `created_at=${new Date().toISOString()}`,
    `memory_dir=${report.memoryDir}`,
    `agent_id=${report.agentId ?? ""}`,
    `status=${report.status}`,
    `branch=${report.branch ?? ""}`,
    `upstream=${report.upstream ?? ""}`,
    `remote=${report.git?.remote ?? ""}`,
  ];
  writeTextFile(path.join(bundleDir, "metadata.env"), `${metadataLines.join("\n")}\n`);

  writeTextFile(
    path.join(bundleDir, "git-status.txt"),
    gitOutput(report.memoryDir, ["status", "--porcelain=2", "--branch"]),
  );
  writeTextFile(
    path.join(bundleDir, "git-log.txt"),
    gitOutput(report.memoryDir, ["log", "--graph", "--oneline", "--decorate", "--all", "-n", "30"]),
  );
  writeTextFile(
    path.join(bundleDir, "git-remotes.txt"),
    gitOutput(report.memoryDir, ["remote", "-v"]),
  );
  writeTextFile(
    path.join(bundleDir, "git-reflog-origin-main.txt"),
    report.upstream ? gitOutput(report.memoryDir, ["reflog", "show", report.upstream, "-n", "20"]) : "No upstream configured.\n",
  );

  const snapshotDir = path.join(bundleDir, "memory-snapshot");
  fs.cpSync(report.memoryDir, snapshotDir, {
    recursive: true,
    preserveTimestamps: true,
  });

  return bundleDir;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }

    if (!args.memoryDir) {
      throw new Error("Provide --memory-dir <path> or --agent <agent-id>.");
    }

    if (!["text", "json"].includes(args.format)) {
      throw new Error(`Unsupported format: ${args.format}`);
    }

    const report = inspect(args.memoryDir, args.agentId);
    let exportedPath = null;
    let bundlePath = null;
    if (args.exportReport) {
      exportedPath = exportReport(args.exportReport, report);
    }
    if (args.exportBundle) {
      bundlePath = exportBundle(args.exportBundle, report);
    }

    if (args.format === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatText(report));
      if (exportedPath) {
        console.log(`Report written to: ${exportedPath}`);
      }
      if (bundlePath) {
        console.log(`Bundle written to: ${bundlePath}`);
      }
    }

    process.exit(exitCodeForStatus(report.status));
  } catch (error) {
    console.error(`memfs-doctor: ${error.message}`);
    process.exit(2);
  }
}

main();
