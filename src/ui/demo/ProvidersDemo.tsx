import { useEffect, useRef } from "react";
import { ProvidersScreen } from "../providers/ProvidersScreen";
import { drive, snap, until } from "./driver";
import { providerAsserts, readCards } from "./providers";
import { Asserts } from "./result";

// `scripts/demo/run.sh` puts this fake first on PATH.
const FAKE_PRINTS = "0.0.1";
const PREFLIGHT_MS = 180_000;

/** M3's demo: preflight on this machine's real CLIs, then every card, one frame each. */
export function ProvidersDemo({ out }: { out: string }) {
  const root = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const a = new Asserts("providers");
    void drive(a, async () => {
      const el = root.current as HTMLDivElement;
      const cards = await until(
        "preflight to finish",
        () => {
          const again = [...el.querySelectorAll("button")].find(
            (b) => b.textContent === "Check again",
          );
          const shown = readCards(el);
          return again && !again.disabled && shown.length > 0 && shown;
        },
        PREFLIGHT_MS,
      );
      await snap(a, "providers");
      for (const card of cards) {
        card.el.scrollIntoView({ block: "start" });
        await snap(a, `card ${card.provider}`, card.el);
        // A tall card's Rejected section sits below the fold.
        const rejected = card.el.querySelector('[aria-label="Rejected binaries"]');
        if (rejected) {
          rejected.scrollIntoView({ block: "end" });
          await snap(a, `card ${card.provider} rejected`, card.el);
        }
      }
      for (const check of providerAsserts(cards, { path: `${out}/bin/codex`, prints: FAKE_PRINTS }))
        a.check(check.name, check.pass, check.detail);
    });
  }, [out]);
  return (
    <div ref={root}>
      <ProvidersScreen />
    </div>
  );
}
