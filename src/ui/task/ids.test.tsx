import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ActivityTrace } from "./ActivityTrace";
import { running, task } from "./fixtures";
import { WorkerMap } from "./WorkerMap";

/** Every url(#id) must point at a gradient inside its own SVG. */
function expectSelfContained(container: HTMLElement) {
  const ids = [...container.querySelectorAll("[id]")].map((n) => n.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const svg of container.querySelectorAll("svg")) {
    const own = new Set([...svg.querySelectorAll("[id]")].map((n) => n.id));
    // jsdom serializes inline styles as url("#id"), attributes as url(#id).
    const refs = [...svg.outerHTML.matchAll(/url\((?:&quot;|["'])?#([^)"'&]+)/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(own.has(ref ?? ""), ref).toBe(true);
  }
}

describe("SVG ids", () => {
  test("two activity traces never share a gradient id", () => {
    const { container } = render(
      <>
        <ActivityTrace samples={[1, 4, 2, 6]} />
        <ActivityTrace samples={[1, 4, 2, 6]} />
      </>,
    );
    expectSelfContained(container);
  });

  test("two worker maps never share a gradient id", () => {
    const { container } = render(
      <>
        <WorkerMap task={task} workers={running} />
        <WorkerMap task={task} workers={running} />
      </>,
    );
    expectSelfContained(container);
  });
});
