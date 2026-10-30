import { type ITerminalInitOnlyOptions, type ITerminalOptions, Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { Saved } from "./port";

/** A terminal in the theme's colours. DOM renderer: see TerminalPane. */
export function themedTerminal(
  el: HTMLElement,
  options: ITerminalOptions & ITerminalInitOnlyOptions,
): Terminal {
  const style = getComputedStyle(el);
  const color = hex(style.color);
  return new Terminal({
    fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
    fontSize: 13,
    minimumContrastRatio: 4.5,
    theme: { background: hex(style.backgroundColor), foreground: color, cursor: color },
    ...options,
  });
}

/** xterm parses hex and rgb only; kbui tokens compute to oklch. A canvas pixel converts any colour. */
function hex(css: string): string {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return css;
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** The visible rows, trailing blanks trimmed. */
export function screenRows(term: Terminal): string[] {
  const buf = term.buffer.active;
  return Array.from({ length: term.rows }, (_, y) =>
    (buf.getLine(buf.viewportY + y)?.translateToString(true) ?? "").trimEnd(),
  );
}

/** A snapshot's rows as the viewer replays it, in an offscreen terminal. */
export async function replayRows(saved: Saved): Promise<string[]> {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:-10000px;top:0";
  document.body.append(el);
  const term = new Terminal({ cols: saved.cols, rows: saved.rows, scrollback: 0 });
  try {
    term.open(el);
    await new Promise<void>((r) => term.write(saved.vt, r));
    return screenRows(term);
  } finally {
    term.dispose();
    el.remove();
  }
}
