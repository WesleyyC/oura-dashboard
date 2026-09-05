import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { repositoryContext, runGit } from "./lib/git.mjs";
import {
  buildOverlapReport,
  classifyPath,
  listWorktrees,
} from "./lib/worktrees.mjs";

export function statusForRepository(cwd = process.cwd()) {
  const context = repositoryContext(cwd, { timeout: 2_000 });
  const worktrees = listWorktrees(context.root, { timeout: 2_000 });
  const changedFilesByBranch = new Map();
  const details = worktrees.map((worktree) => {
    const branch = worktree.branch;
    const issues = [];
    const inspectGit = (args, options) => {
      const result = runGit(args, { ...options, timeout: 2_000 });
      if (result.status !== 0) issues.push(`${args[0]} unavailable or timed out`);
      // Partial output is not a reliable inspection of the worktree.
      return result.status === 0 ? result.stdout : "";
    };
    const missingHead = !worktree.head || /^0+$/.test(worktree.head);
    if (missingHead) issues.push("HEAD unavailable; local changes unknown");
    const committed = branch && branch !== "main"
      ? parseNameStatusPaths(inspectGit(["diff", "--name-status", "-z", "-M", `main...${branch}`], {
          cwd: context.root,
          allowFailure: true,
          trimOutput: false,
        }))
      : [];
    const local = worktree.prunable || missingHead
      ? []
      : parseStatusPaths(inspectGit(["status", "--porcelain", "-z"], {
          cwd: worktree.path,
          allowFailure: true,
          trimOutput: false,
        }));
    if (worktree.prunable) issues.push("worktree unavailable; local changes unknown");
    const changedFiles = [...new Set([...committed, ...local])].sort();
    if (branch) changedFilesByBranch.set(branch, changedFiles);
    const counts = branch && branch !== "main"
      ? inspectGit(["rev-list", "--left-right", "--count", `main...${branch}`], {
          cwd: context.root,
          allowFailure: true,
        }).split(/\s+/).map(Number)
      : [0, 0];
    const areas = {};
    for (const file of changedFiles) {
      const area = classifyPath(file);
      areas[area] = (areas[area] ?? 0) + 1;
    }
    return {
      ...worktree,
      inspection: issues.length ? "incomplete" : "complete",
      issues,
      ahead: Number.isFinite(counts[1]) ? counts[1] : 0,
      behind: Number.isFinite(counts[0]) ? counts[0] : 0,
      areas,
      changedFiles,
    };
  });
  return {
    complete: details.every(({ inspection }) => inspection === "complete"),
    worktrees: details,
    overlaps: buildOverlapReport(details, changedFilesByBranch),
  };
}

export function parseNameStatusPaths(source) {
  const fields = nulFields(source);
  const paths = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    paths.push(...fields.slice(index, index + pathCount));
    index += pathCount;
  }
  return paths.filter(Boolean);
}

export function parseStatusPaths(source) {
  const records = nulFields(source);
  const paths = [];
  for (let index = 0; index < records.length;) {
    const record = records[index++];
    const status = record.slice(0, 2);
    paths.push(record.slice(3));
    if (/[RC]/.test(status) && index < records.length) {
      paths.push(records[index++]);
    }
  }
  return paths.filter(Boolean);
}

function nulFields(source) {
  return source ? source.split("\0").filter(Boolean) : [];
}

export function formatStatus(report) {
  const rows = report.worktrees.map((item) => {
    const areas = Object.entries(item.areas)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([area, count]) => `${area}:${count}`)
      .join(",") || "-";
    return `${item.branch || "(detached)"}\t${item.inspection === "incomplete" ? "unknown" : `+${item.ahead}/-${item.behind}`}\t${item.inspection === "incomplete" ? "incomplete" : "live"}\t${areas}\t${item.path}`;
  });
  const overlaps = report.overlaps.length
    ? report.overlaps.flatMap(({ branches, files }) => [
        `${branches.join(" <-> ")}`,
        ...files.map((file) => `  ${file}`),
      ])
    : [report.complete ? "none" : "unknown: incomplete worktree inspection; coordinate before editing"];
  return [`Branch\tAhead/Behind\tState\tAreas\tPath`, ...rows, "", "Overlaps", ...overlaps].join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const report = statusForRepository();
    process.stdout.write(`${formatStatus(report)}\n`);
    if (!report.complete) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Agent status failed"}\n`);
    process.exitCode = 1;
  }
}
