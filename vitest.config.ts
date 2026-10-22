import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Unit tests run in jsdom; *.browser.test.tsx render in Chromium for layout and axe.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            environment: "jsdom",
            // Vite, not Node, must load kbui so preserveSymlinks applies in jsdom.
            server: { deps: { inline: [/@kbui\//] } },
            setupFiles: ["./src/test/setup.ts"],
            include: ["src/**/*.test.{ts,tsx}"],
            exclude: ["src/**/*.browser.test.tsx"],
          },
        },
        {
          extends: true,
          test: {
            name: "browser",
            include: ["src/**/*.browser.test.tsx"],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              // Same checks twice: default, then with the reduced-motion preference on.
              instances: [
                { browser: "chromium" },
                {
                  browser: "chromium",
                  name: "chromium-reduced-motion",
                  provider: playwright({ contextOptions: { reducedMotion: "reduce" } }),
                },
              ],
            },
          },
        },
      ],
    },
  }),
);
