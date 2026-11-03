import { Button } from "@kb.ui/react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { NeedsYouChoice, NeedsYouItem } from "../approvals/model";
import { LightIcon } from "./icons";
import {
  type Assumption,
  type Decision,
  type Light,
  type LineEntry,
  lineWord,
  type OtherCheck,
  type Shot,
  stageLabel,
  type TraceNode,
} from "./model";
import { type Design, Preview } from "./Preview";
import { Files, Problems, ToFull } from "./StageViews";
import { Questions } from "./Workbench";

/** Two panes from this container width; below it a line opens in place. */
const WIDE_REM = 56;

/** Null until measured, so jsdom and the first paint get the two panes. */
function useWide() {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      if (width) setWide(width >= WIDE_REM * rem);
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return [ref, wide ?? true] as const;
}

/** Main's light, then now's: "main ✗ → now ✓". */
function Was({ was, now }: { was: Light; now: Light }) {
  return (
    <span className="journey-line-was">
      main{" "}
      <span className="journey-row-icon" data-light={was}>
        <LightIcon light={was} />
      </span>
      <span className="journey-sr">{` ${lineWord[was]}, `}</span>
      <span aria-hidden="true">→</span> now{" "}
      <span className="journey-row-icon" data-light={now}>
        <LightIcon light={now} />
      </span>
      <span className="journey-sr">{` ${lineWord[now]}`}</span>
    </span>
  );
}

function NodeList({ label, nodes, mono }: { label: string; nodes: TraceNode[]; mono?: boolean }) {
  const id = useId();
  return (
    <>
      <h3 id={id} className="page-label">
        {label}
      </h3>
      <ul aria-labelledby={id}>
        {nodes.map((n) => (
          <li key={n.id} className="journey-row" data-light={mono ? undefined : n.light}>
            <span className="journey-row-icon">{mono ? null : <LightIcon light={n.light} />}</span>
            <span className="journey-row-text">{n.title}</span>
            <span className="journey-row-meta">{n.meta}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export type DetailProps = {
  /** The stage's screenshots; a line with a shot shows them. */
  shots: Shot[];
  /** An example shown while a choice is pointed at. */
  example: Shot | null;
  design: Design;
  /** A question just raised; it opens first. */
  prefer: string | null;
  onAnswer: (item: NeedsYouItem, choice: NeedsYouChoice) => void;
  onExample: (shot: string | null) => void;
  /** Opens the map at a node; absent when nothing is traced. */
  onMap?: ((node: string | null) => void) | undefined;
};

/** One line, whole: its state, what blocks it, its screenshots, its code and what ran. */
function Detail({
  id,
  entry,
  shots,
  example,
  design,
  prefer,
  onAnswer,
  onExample,
  onMap,
}: DetailProps & { id: string; entry: LineEntry }) {
  const said = [
    entry.light ? lineWord[entry.light] : "",
    entry.reason ?? "",
    entry.checker && entry.checker !== entry.reason ? entry.checker : "",
  ].filter(Boolean);
  const shown = entry.shots.length > 0 || example;
  return (
    <section id={id} className="journey-detail" aria-labelledby={`${id}-name`}>
      <h2 id={`${id}-name`} className="journey-detail-name" tabIndex={-1}>
        {entry.title}
      </h2>
      {said.length ? (
        <p className="journey-detail-state" data-light={entry.light}>
          {entry.light ? (
            <span className="journey-row-icon">
              <LightIcon light={entry.light} />
            </span>
          ) : null}
          <span>{said.join(" · ")}</span>
          {entry.was && entry.light ? <Was was={entry.was} now={entry.light} /> : null}
        </p>
      ) : null}
      {entry.questions.length || entry.answered.length ? (
        <ToFull to="ask">
          <Questions
            key={entry.key}
            level="h3"
            items={entry.questions}
            answered={entry.answered}
            prefer={prefer}
            onWhy={onMap}
            onExample={onExample}
            onAnswer={onAnswer}
          />
        </ToFull>
      ) : null}
      {entry.problems.length ? (
        <Problems key={entry.key} level="h3" problems={entry.problems} onWhy={onMap} />
      ) : null}
      {entry.checks.length ? <Checks checks={entry.checks} /> : null}
      {shown ? (
        <section className="journey-section" aria-label="Screenshots">
          <h3 className="page-label">Screenshots</h3>
          <Preview shots={entry.shots.length ? shots : []} example={example} design={design} />
        </section>
      ) : null}
      {entry.code.length ? (
        <section className="journey-section">
          <NodeList label="In the code" nodes={entry.code} mono />
          {entry.claimed ? (
            <p className="journey-claim">
              The plan says this code serves the goal; no test has shown it yet.
            </p>
          ) : null}
        </section>
      ) : null}
      {entry.ran.length ? (
        <section className="journey-section">
          <NodeList label="What ran" nodes={entry.ran} />
        </section>
      ) : null}
      {entry.files.length ? (
        <section className="journey-section">
          <h3 className="page-label">Changed files</h3>
          <Files files={entry.files} label="Changed files" />
        </section>
      ) : null}
      {onMap && (entry.node || entry.code.length || entry.ran.length) ? (
        <span>
          <Button size="sm" variant="secondary" onClick={() => onMap(entry.node ?? null)}>
            Open the map
          </Button>
        </span>
      ) : null}
    </section>
  );
}

/** Each other check as main had it, then now. */
function Checks({ checks }: { checks: OtherCheck[] }) {
  const id = useId();
  return (
    <section className="journey-section" aria-labelledby={id}>
      <h3 id={id} className="page-label">
        Before and after
      </h3>
      <ul aria-labelledby={id}>
        {checks.map((c) => (
          <li key={c.label} className="journey-row" data-light={c.now?.light}>
            <span className="journey-row-icon">
              {c.now ? <LightIcon light={c.now.light} /> : null}
            </span>
            <span className="journey-row-text">{c.label}</span>
            <span className="journey-row-meta journey-other">
              main <span>{c.was?.text}</span>
              <span aria-hidden="true"> → </span>
              <span className="journey-sr">, </span>now <span>{c.now?.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Your answers and the agents' guesses, folded under the list so nothing is lost. */
function Folds({
  decisions,
  assumptions,
  raised,
  onChange,
}: {
  decisions: Decision[];
  assumptions: Assumption[];
  raised: ReadonlySet<string>;
  onChange?: ((a: Assumption) => void) | undefined;
}) {
  const id = useId();
  return (
    <>
      {decisions.length ? (
        <details className="journey-passed">
          <summary>{`Your answers (${decisions.length})`}</summary>
          <ul aria-label="Your answers">
            {decisions.map((d) => (
              <li key={d.text} className="journey-row" data-light="done">
                <span className="journey-row-icon">
                  <LightIcon light="done" />
                </span>
                <span className="journey-row-text">{d.text}</span>
                <span className="journey-row-meta">{stageLabel[d.stage]}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {assumptions.length ? (
        <details className="journey-passed">
          <summary id={id}>{`Made without asking you (${assumptions.length})`}</summary>
          <ul aria-label="Made without asking you">
            {assumptions.map((a) => (
              <li key={a.id} className="journey-row" data-light="waiting">
                <span className="journey-row-icon">
                  <LightIcon light="waiting" />
                </span>
                <span className="journey-row-text">{a.text}</span>
                <span className="journey-row-meta">
                  {raised.has(a.id) ? (
                    "Now a question"
                  ) : onChange ? (
                    <Button size="sm" variant="ghost" onClick={() => onChange(a)}>
                      Change
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

type LinesProps = DetailProps & {
  entries: LineEntry[];
  /** The open entry's key; "" closes it in place on a narrow page. */
  picked: string;
  onPick: (key: string) => void;
  decisions: Decision[];
  assumptions: Assumption[];
  raised: ReadonlySet<string>;
  onChange?: ((a: Assumption) => void) | undefined;
};

/** What you asked for, a line per row; the picked one's detail beside it, or under it when narrow. */
export function Lines({
  entries,
  picked,
  onPick,
  decisions,
  assumptions,
  raised,
  onChange,
  ...detail
}: LinesProps) {
  const id = useId();
  const [ref, wide] = useWide();
  // Only a click or Enter moves focus to the detail; arrowing never does.
  const [moved, setMoved] = useState(0);
  const current = entries.find((e) => e.key === picked);
  const pane = current ? <Detail id={`${id}-detail`} entry={current} {...detail} /> : null;
  useEffect(() => {
    if (moved && wide) document.getElementById(`${id}-detail-name`)?.focus();
  }, [moved, wide, id]);
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: entries.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const rows = e.currentTarget.closest("ul")?.querySelectorAll<HTMLElement>(".journey-line");
    rows?.[Math.min(Math.max(to, 0), entries.length - 1)]?.focus();
  };
  const row = (e: LineEntry, i: number): ReactNode => {
    const open = e.key === picked;
    return (
      <li key={e.key} className="journey-lines-item">
        <button
          type="button"
          className="journey-line"
          data-light={e.light}
          aria-current={wide && open ? "true" : undefined}
          aria-expanded={wide ? undefined : open}
          aria-controls={open ? `${id}-detail` : undefined}
          onClick={() => {
            onPick(!wide && open ? "" : e.key);
            setMoved((n) => n + 1);
          }}
          onKeyDown={(ev) => move(ev, i)}
        >
          <span className="journey-row-icon">{e.light ? <LightIcon light={e.light} /> : null}</span>
          <span className="journey-line-text">{e.title}</span>
          <span className="journey-line-state">
            {e.light ? <span className="journey-line-word">{lineWord[e.light]}</span> : null}
            {e.was && e.light ? (
              <Was was={e.was} now={e.light} />
            ) : e.reason ? (
              <span className="journey-line-reason">{e.reason}</span>
            ) : null}
          </span>
        </button>
        {!wide && open ? pane : null}
      </li>
    );
  };
  return (
    <div ref={ref} className="journey-lines" data-wide={wide ? "" : undefined}>
      <div className="journey-lines-list">
        <h2 id={`${id}-name`} className="page-label">
          You asked for
        </h2>
        <ul aria-labelledby={`${id}-name`}>{entries.map(row)}</ul>
        <Folds
          decisions={decisions}
          assumptions={assumptions}
          raised={raised}
          onChange={onChange}
        />
      </div>
      {wide && pane ? <div className="journey-detail-wrap">{pane}</div> : null}
    </div>
  );
}
