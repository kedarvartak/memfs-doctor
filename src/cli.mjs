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
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.memoryDir && args.agentId) {
    args.memoryDir = path.join(
      os.homedir(),
      ".letta",
      "agents",
      args.agentId,
      "memory",
    );
  }

  return args;
}

function printHelp() {
  console.log(`MemFS Doctor

Usage:
  memfs-doctor --memory-dir <path>
  memfs-doctor --agent <agent-id>
  memfs-doctor --agent <agent-id> --format json

Options:
  --memory-dir <path>   Inspect a specific MemFS directory
  --agent <id>          Resolve ~/.letta/agents/<id>/memory
  --format <text|json>  Output format (default: text)
  -h, --help            Show help
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
  return (
    text.includes("<<<<<<<") ||
    text.includes("=======") ||
    text.includes(">>>>>>>")
  );
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

  for (const line of rawFrontmatter.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, value] = match;
    data[key] = value.trim();
  }

  return { ok: true, frontmatter: data, body };
}

function walkMarkdownFiles(memoryDir) {
  const results = [];
  const topLevel = fs.readdirSync(memoryDir, { withFileTypes: true });

  for (const entry of topLevel) {
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
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
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
  };

  if (!memoryDir || !fs.existsSync(memoryDir)) {
    addFinding(
      findings,
      "error",
      "MEMORY_DIR_MISSING",
      "Memory directory does not exist.",
      { path: memoryDir ?? null },
    );
    result.status = "error";
    result.summary = "Memory directory missing.";
    return result;
  }

  const requiredPaths = [
    ".git",
    ".letta/config.json",
    "system",
    "system/persona.md",
    "system/human.md",
  ];

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
        if (line.startsWith("# branch.head ")) {
          result.branch = line.slice("# branch.head ".length).trim();
          if (result.branch === "(detached)") {
            addFinding(findings, "error", "GIT_DETACHED_HEAD", "Repository is in detached HEAD state.");
          }
        } else if (line.startsWith("# branch.upstream ")) {
          result.upstream = line.slice("# branch.upstream ".length).trim();
        } else if (line.startsWith("# branch.ab ")) {
          const match = line.match(/\+(\d+)\s+\-(\d+)/);
          if (match) {
            const ahead = Number(match[1]);
            const behind = Number(match[2]);
            if (ahead > 0) {
              addFinding(findings, "warning", "GIT_AHEAD_OF_REMOTE", `Local branch is ahead of upstream by ${ahead} commit(s).`, { details: { ahead } });
            }
            if (behind > 0) {
              addFinding(findings, "warning", "GIT_BEHIND_REMOTE", `Local branch is behind upstream by ${behind} commit(s).`, { details: { behind } });
            }
          }
        } else if (!line.startsWith("# ")) {
          addFinding(findings, "warning", "GIT_DIRTY_WORKTREE", "Working tree has uncommitted changes.");
          break;
        }
      }
    }

    const remoteCheck = runGit(memoryDir, ["remote"]);
    if (remoteCheck.status !== 0 || !remoteCheck.stdout.trim()) {
      addFinding(findings, "warning", "GIT_NO_REMOTE", "No git remote is configured.");
    }

    if (!result.upstream) {
      addFinding(findings, "warning", "GIT_NO_UPSTREAM", "No upstream branch is configured.");
    }

    if (
      fs.existsSync(path.join(memoryDir, ".git", "MERGE_HEAD")) ||
      fs.existsSync(path.join(memoryDir, ".git", "rebase-merge")) ||
      fs.existsSync(path.join(memoryDir, ".git", "rebase-apply"))
    ) {
      addFinding(findings, "error", "GIT_MERGE_IN_PROGRESS", "Git merge or rebase appears to be in progress.");
    }
  }

  const configPath = path.join(memoryDir, ".letta", "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
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

  const hasError = findings.some((finding) => finding.severity === "error");
  const hasWarning = findings.some((finding) => finding.severity === "warning");
  result.status = hasError ? "error" : hasWarning ? "warning" : "healthy";

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
  lines.push(`Summary: ${report.summary}`);

  if (!report.findings.length) {
    lines.push("Findings: none");
    return lines.join("\n");
  }

  lines.push("Findings:");
  for (const finding of report.findings) {
    const location = finding.path ? ` [${finding.path}]` : "";
    lines.push(`- ${finding.severity.toUpperCase()} ${finding.code}${location}: ${finding.message}`);
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
    if (args.format === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatText(report));
    }
    process.exit(exitCodeForStatus(report.status));
  } catch (error) {
    console.error(`memfs-doctor: ${error.message}`);
    process.exit(2);
  }
}

main();
