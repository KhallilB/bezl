// Captures the walkthrough: a PNG per step in both themes, a WebM of the tour, manifest.json.
// Usage: bun run capture:walkthrough [out-dir] [--browser webkit|chromium]. Defaults to a temp dir.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { type AddressInfo, createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Page, webkit } from "playwright";
import { createServer } from "vite";
import {
  type CaptureArgs,
  manifest,
  parseArgs,
  type Shot,
  shots,
  videoFile,
} from "../../src/ui/walkthrough/capture";

const root = resolve(import.meta.dirname, "../..");
const viewport = { width: 1440, height: 900 };
const dwellMs = 1500;

let args: CaptureArgs;
try {
  args = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error((e as Error).message);
  process.exit(2);
}
const out = resolve(args.out ?? mkdtempSync(join(tmpdir(), "bezl-walkthrough-")));
mkdirSync(out, { recursive: true });
const list = shots();
for (const f of [...list.map((s) => s.file), videoFile, "manifest.json"]) {
  rmSync(join(out, f), { force: true });
}

const browserType = { webkit, chromium }[args.browser];
if (!existsSync(browserType.executablePath())) {
  console.log(`Playwright ${args.browser} is missing; installing it`);
  const install = spawnSync("bunx", ["playwright", "install", args.browser], {
    cwd: root,
    stdio: "inherit",
  });
  if (install.status !== 0) process.exit(1);
}

// A dev server on ::1:1420 would answer "localhost" first, so serve on an explicit free port.
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createNetServer().once("error", fail);
    probe.listen(0, host, () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => done(port));
    });
  });
}

// The tour renders fixtures only, so plain Vite serves it; no Tauri.
const host = "127.0.0.1";
const port = await freePort();
const server = await createServer({
  root,
  configFile: join(root, "vite.config.ts"),
  logLevel: "warn",
  server: { host, port, strictPort: true },
});
await server.listen();
const base = `http://${host}:${port}`;
// Vite keeps the process alive, so a failed launch must close it.
const browser = await browserType.launch().catch(async (e) => {
  await server.close();
  throw e;
});

// Ready once the dock shows this step, every frame has rendered, fonts loaded and entry animations ended.
async function settle(page: Page, title: string) {
  await page.waitForFunction(
    (t) =>
      document.querySelector(".walkthrough-title")?.textContent === t &&
      [...document.querySelectorAll("iframe")].every(
        (f) => (f.contentDocument?.getElementById("root")?.childElementCount ?? 0) > 0,
      ),
    title,
  );
  for (const frame of page.frames()) {
    await frame.evaluate(async () => {
      await document.fonts.ready;
      const finite = document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity);
      await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
    });
  }
}

async function open(page: Page, shot: Shot) {
  await page.emulateMedia({ colorScheme: shot.theme });
  await page.goto(`${base}/${shot.search}`);
  await settle(page, shot.title);
}

try {
  const page = await browser.newPage({ viewport });
  for (const shot of list) {
    await open(page, shot);
    await page.screenshot({ path: join(out, shot.file) });
  }
  await page.close();

  const context = await browser.newContext({ viewport, recordVideo: { dir: out, size: viewport } });
  const player = await context.newPage();
  const [first, ...rest] = list.filter((s) => s.theme === "dark");
  if (first) await open(player, first);
  for (const shot of rest) {
    await player.waitForTimeout(dwellMs);
    // A focused field owns the arrow keys.
    await player.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await player.keyboard.press("ArrowRight");
    await settle(player, shot.title);
  }
  await player.waitForTimeout(dwellMs);
  const video = player.video();
  await context.close();
  await video?.saveAs(join(out, videoFile));
  await video?.delete();

  writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest(list), null, 2)}\n`);
  console.log(`${list.length} screenshots and ${videoFile} in ${out}`);
} finally {
  await browser.close();
  await server.close();
}
