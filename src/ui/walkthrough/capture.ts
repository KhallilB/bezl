// What scripts/walkthrough/capture.ts shoots and writes; the browser work stays in the script.
import { type Theme, themes } from "./states";
import { type Chapter, steps, tourSearch } from "./tour";

export const browsers = ["webkit", "chromium"] as const;
export type Browser = (typeof browsers)[number];

export type CaptureArgs = { out: string | null; browser: Browser };

export type Shot = {
  step: number;
  id: string;
  chapter: Chapter;
  title: string;
  theme: Theme;
  search: string;
  file: string;
};

export const videoFile = "walkthrough.webm";

export function shots(): Shot[] {
  const width = Math.max(String(steps.length).length, 2);
  return steps.flatMap(({ id, chapter, title }, index) =>
    themes.map((theme) => {
      const step = index + 1;
      const file = `${String(step).padStart(width, "0")}-${id}-${theme}.png`;
      return { step, id, chapter, title, theme, search: tourSearch({ index, theme }), file };
    }),
  );
}

export function manifest(list: Shot[]) {
  return {
    video: videoFile,
    shots: list.map(({ step, chapter, title, theme, file }) => ({
      step,
      chapter,
      title,
      theme,
      file,
    })),
  };
}

export function parseArgs(argv: string[]): CaptureArgs {
  const args: CaptureArgs = { out: null, browser: "webkit" };
  const rest = [...argv];
  while (rest.length > 0) {
    const arg = rest.shift() ?? "";
    if (arg === "--browser" || arg.startsWith("--browser=")) {
      const name = arg === "--browser" ? rest.shift() : arg.slice("--browser=".length);
      const browser = browsers.find((b) => b === name);
      if (!browser)
        throw new Error(`--browser takes ${browsers.join("|")}, not ${name ?? "nothing"}`);
      args.browser = browser;
    } else if (arg.startsWith("--") || args.out !== null) {
      throw new Error(
        `unexpected argument ${arg}; usage: [out-dir] [--browser ${browsers.join("|")}]`,
      );
    } else {
      args.out = arg;
    }
  }
  return args;
}
