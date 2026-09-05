import { runGit } from "./git.mjs";

export function validateTopic(value) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value ?? "")) {
    throw new Error("Topic must be a lowercase kebab-case slug");
  }
  return value;
}

export function listWorktrees(cwd = process.cwd(), { timeout } = {}) {
  return parseWorktreePorcelain(
    runGit(["worktree", "list", "--porcelain"], { cwd, timeout }).stdout,
  );
}

export function parseWorktreePorcelain(source) {
  if (!source.trim()) return [];
  return source
    .split(/\n\s*\n/)
    .map((block) => {
      const item = {
        path: "",
        head: "",
        branch: "",
        bare: false,
        detached: false,
        prunable: false,
      };
      for (const line of block.split("\n")) {
        const [key, ...rest] = line.split(" ");
        const value = rest.join(" ");
        if (key === "worktree") item.path = value;
        if (key === "HEAD") item.head = value;
        if (key === "branch") item.branch = value.replace(/^refs\/heads\//, "");
        if (key === "bare") item.bare = true;
        if (key === "detached") item.detached = true;
        if (key === "prunable") item.prunable = true;
      }
      return item;
    })
    .filter(({ path }) => path);
}

export function classifyPath(path) {
  const [root, name] = path.split("/");
  if (root === "features") return name ?? "features";
  if (["platform", "shared", "app", "tests", "scripts", "docs"].includes(root)) {
    return root;
  }
  return "repository";
}

export function buildOverlapReport(worktrees, changedFilesByBranch) {
  const branches = worktrees
    .map(({ branch }) => branch)
    .filter((branch) => branch && branch !== "main")
    .sort();
  const overlaps = [];
  for (let leftIndex = 0; leftIndex < branches.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < branches.length; rightIndex += 1) {
      const left = branches[leftIndex];
      const right = branches[rightIndex];
      const rightFiles = new Set(changedFilesByBranch.get(right) ?? []);
      const files = [...new Set(changedFilesByBranch.get(left) ?? [])]
        .filter((file) => rightFiles.has(file))
        .sort();
      if (files.length) overlaps.push({ branches: [left, right], files });
    }
  }
  return overlaps;
}
