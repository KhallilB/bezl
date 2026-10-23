import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type CheckResult = { cmd: string; exit: number; tail: string };
export type Workspace = {
  dir: string;
  base: string;
  diff(): Promise<string>;
  check(cmds: string[]): Promise<CheckResult[]>;
  dispose(): Promise<void>;
};

const TAIL_LINES = 40;

async function git(cwd: string, ...args: string[]): Promise<string> {
  const p = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  if ((await p.exited) !== 0) throw new Error(`git ${args.join(" ")}: ${err.trim()}`);
  return out;
}

// A detached worktree per task: the agents never touch the user's checkout.
export async function openWorkspace(repo: string, baseRef: string, checkTimeoutMs = 600_000): Promise<Workspace> {
  const base = (await git(repo, "rev-parse", `${baseRef}^{commit}`)).trim();
  const parent = mkdtempSync(join(tmpdir(), "crew-wt-"));
  const dir = join(parent, "wt");
  await git(repo, "worktree", "add", "--detach", dir, base);
  return {
    dir,
    base,
    async diff() {
      await git(dir, "add", "-A", "-N", "."); // intent-to-add, so new files show in the diff
      return git(dir, "diff", base);
    },
    async check(cmds) {
      const results: CheckResult[] = [];
      for (const cmd of cmds) {
        const p = Bun.spawn(["sh", "-c", `${cmd} 2>&1`], { cwd: dir, stdout: "pipe", timeout: checkTimeoutMs });
        const out = await new Response(p.stdout).text();
        results.push({ cmd, exit: await p.exited, tail: out.trimEnd().split("\n").slice(-TAIL_LINES).join("\n") });
      }
      return results;
    },
    async dispose() {
      await git(repo, "worktree", "remove", "--force", dir).catch(() => {});
      rmSync(parent, { recursive: true, force: true });
    },
  };
}
