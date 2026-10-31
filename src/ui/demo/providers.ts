import type { Assert } from "./result";

export type Card = {
  provider: string;
  name: string;
  el: HTMLElement;
  rejected: { path: string; says: string }[];
};

/** Provider cards as the Providers screen renders them. */
export function readCards(root: ParentNode): Card[] {
  return [...root.querySelectorAll<HTMLElement>('[aria-labelledby^="provider-"]')].map((el) => {
    const id = el.getAttribute("aria-labelledby") ?? "";
    const rejected = [...el.querySelectorAll('[aria-label="Rejected binaries"] > li')].map((li) => {
      const path = li.querySelector("code")?.textContent ?? "";
      return { path, says: (li.textContent ?? "").replace(path, "").trim() };
    });
    return {
      provider: id.replace(/^provider-/, "").replace(/-title$/, ""),
      name: root.querySelector(`[id="${id}"]`)?.textContent ?? "",
      el,
      rejected,
    };
  });
}

/** M3's demo: every CLI shows, and a fake `codex` is rejected with what it printed. */
export function providerAsserts(cards: Card[], fake: { path: string; prints: string }): Assert[] {
  const codex = cards.find((c) => c.provider === "codex");
  const entry = codex?.rejected.find((r) => r.path === fake.path);
  return [
    {
      name: "provider cards shown",
      pass: cards.length > 0,
      detail: cards.map((c) => c.name).join(", ") || "none",
    },
    {
      name: "fake codex rejected, showing what it printed",
      pass: entry?.says.includes(fake.prints) ?? false,
      detail: entry
        ? `${entry.path}: ${entry.says}`
        : `not among rejected: ${codex?.rejected.map((r) => r.path).join(", ") || "none"}`,
    },
  ];
}
