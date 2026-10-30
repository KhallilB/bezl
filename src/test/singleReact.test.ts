import { createRequire } from "node:module";
import "@kb.ui/react";
import "@testing-library/react";
import "react-dom/client";
import { expect, test } from "vitest";

// Nested worktree with a stale install borrows packages from the parent checkout, and their React.
test("loads one React copy, from this project's node_modules", () => {
  const require = createRequire(import.meta.url);
  const copies = Object.keys(require.cache).filter((path) =>
    path.endsWith("/node_modules/react/index.js"),
  );
  const own = require.resolve("react");
  expect(copies, `React loaded from ${copies.join(", ")}; run bun install`).toEqual([own]);
});
