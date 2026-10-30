import { invoke } from "@tauri-apps/api/core";
import type { Asserts } from "./result";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const log = (line: string) => void invoke("demo_log", { line });

/** Polls until `get` yields a value; throws naming what never came. */
export async function until<T>(what: string, get: () => T | null | undefined | false, ms: number) {
  log(`waiting for ${what}`);
  const end = Date.now() + ms;
  for (;;) {
    const got = get();
    if (got) return got;
    if (Date.now() > end) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
    await sleep(100);
  }
}

/** Saves the next numbered frame: the window, or `el` clipped to the viewport. */
export async function snap(a: Asserts, name: string, el?: Element) {
  log(`snap ${name}`);
  // Not requestAnimationFrame: an occluded window never fires it.
  await sleep(300);
  let rect = null;
  if (el) {
    const r = el.getBoundingClientRect();
    const x = Math.max(0, r.left);
    const y = Math.max(0, r.top);
    rect = {
      x,
      y,
      width: Math.min(window.innerWidth, r.right) - x,
      height: Math.min(window.innerHeight, r.bottom) - y,
    };
  }
  const path = await invoke<string>("demo_snap", { name, rect });
  log(`saved ${path}`);
  a.frame(path);
}

/** Runs the script, records a throw as a failed check, then writes `result.json` and quits. */
export async function drive(a: Asserts, script: () => Promise<void>) {
  try {
    await script();
  } catch (e) {
    log(`threw ${e}`);
    a.threw(e);
  }
  await invoke("demo_done", { result: JSON.stringify(a.result(), null, 2) });
}
