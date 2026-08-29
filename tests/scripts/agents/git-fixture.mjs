import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function createGitFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "oura-dashboard-agent-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-b", "main");
  git("config", "user.name", "Agent Test");
  git("config", "user.email", "agent-test@example.invalid");
  await writeFile(
    join(root, ".gitignore"),
    ".worktrees/\nnode_modules/\nwork/\n",
  );
  await writeFile(
    join(root, "package.json"),
    '{"name":"fixture","private":true}\n',
  );
  await writeFile(
    join(root, "package-lock.json"),
    '{"name":"fixture","lockfileVersion":3,"packages":{"":{"name":"fixture"}}}\n',
  );
  git("add", ".");
  git("commit", "-m", "fixture");
  return {
    root,
    runGit: (...args) => git(...args),
    async commitFile(path, contents, message = `change ${path}`) {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
      git("add", path);
      git("commit", "-m", message);
    },
  };
}
