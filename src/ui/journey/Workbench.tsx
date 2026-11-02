import { Badge, Button, Dialog, Panel, Tooltip } from "@kb.ui/react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useState } from "react";
import { kindLabel, type NeedsYouChoice, type NeedsYouItem } from "../approvals/model";
import { usePortalRoot } from "../theme/AppTheme";
import { EvidenceMap } from "./EvidenceMap";
import { LightIcon } from "./icons";
import {
  type Assumption,
  type Coverage,
  type Decision,
  type DoneWhen,
  type Handled,
  type Impact,
  lightLabel,
  pathOf,
  type Shot,
  type Step,
  stageLabel,
  type TaskContext,
  type Trace,
  type TraceNode,
} from "./model";
import { type Design, Preview } from "./Preview";

/** One part of a task's proof: a section on the page, a tab in full screen. */
export type Part = "screens" | "evidence" | "intent";

const riskTone = { low: "success", medium: "warning", high: "danger" } as const;

// Chips start with a capital, as on Providers.
const capital = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/** One line under the stages: the goal, how far the change reaches, how sure Bezl is. */
export function Summary({
  context,
  impact,
  coverage,
  preview,
  trace,
  intent,
  onIntent,
  onGo,
}: {
  context: TaskContext;
  impact?: Impact | undefined;
  coverage?: Coverage | undefined;
  /** This stage has screenshots, so the change goes to them. */
  preview: boolean;
  /** The task has a trace, so the evidence goes to it. */
  trace: boolean;
  /** Whether Intent is open, and the id of the region it opens. */
  intent: { open: boolean; id: string };
  onIntent: () => void;
  onGo: (to: Part) => void;
}) {
  const portal = usePortalRoot();
  const total = coverage
    ? coverage.covered + coverage.uncovered + coverage.unknown + coverage.excluded
    : 0;
  const go = (to: Part, text: string, on: boolean) =>
    on ? (
      <Button size="sm" variant="ghost" onClick={() => onGo(to)}>
        {text}
      </Button>
    ) : (
      <span>{text}</span>
    );
  return (
    <ul className="journey-summary" aria-label="This task">
      <li>
        <span className="journey-eyebrow">Goal</span>
        <Tooltip content={context.goal} {...(portal ? { container: portal } : {})}>
          {go(
            "intent",
            context.lines ? `${context.proven} of ${context.lines} done` : "No checks yet",
            true,
          )}
        </Tooltip>
      </li>
      <li>
        <span className="journey-eyebrow">Change</span>
        {go("screens", context.touches, preview)}
        {impact ? (
          <>
            <Tooltip content={`Based on ${impact.from}`} {...(portal ? { container: portal } : {})}>
              <Button size="sm" variant="ghost" onClick={() => onGo("intent")}>
                <Badge tone={riskTone[impact.risk]}>{`${capital(impact.risk)} risk`}</Badge>
              </Button>
            </Tooltip>
            <span className="journey-summary-note">{impact.reach}</span>
          </>
        ) : null}
      </li>
      <li>
        <span className="journey-eyebrow">Evidence</span>
        {go(
          "evidence",
          coverage && total
            ? `${coverage.covered} of ${total} lines ran in a test`
            : context.evidence,
          trace,
        )}
      </li>
      <li>
        <Button
          size="sm"
          variant="ghost"
          className="journey-disclose"
          aria-expanded={intent.open}
          aria-controls={intent.id}
          onClick={onIntent}
        >
          Intent
        </Button>
      </li>
    </ul>
  );
}

export type Answer = { item: NeedsYouItem; choice: NeedsYouChoice };

/** Points at an example Shot while a choice is hovered or focused; null when it leaves. */
type OnExample = (shotId: string | null) => void;

function Choices({
  item,
  onAnswer,
  onExample,
}: {
  item: NeedsYouItem;
  onAnswer: (c: NeedsYouChoice) => void;
  onExample?: OnExample | undefined;
}) {
  const rec = useId();
  const [hint, setHintState] = useState<string | null>(null);
  const setHint = (id: string | null) => {
    setHintState(id);
    onExample?.(item.choices.find((c) => c.id === id)?.example ?? null);
  };
  const shown = item.choices.find((c) => c.id === (hint ?? item.recommended));
  return (
    <>
      <div className="journey-choices">
        {item.choices.map((c) => (
          <span key={c.id} className="journey-choice">
            <Button
              size="sm"
              variant="secondary"
              aria-describedby={c.id === item.recommended ? rec : undefined}
              onPointerEnter={() => setHint(c.id)}
              onPointerLeave={() => setHint(null)}
              onFocus={() => setHint(c.id)}
              onBlur={() => setHint(null)}
              onClick={() => onAnswer(c)}
            >
              {c.label}
            </Button>
            {c.id === item.recommended ? (
              <Badge id={rec} tone="info">
                Recommended
              </Badge>
            ) : null}
          </span>
        ))}
      </div>
      {shown ? (
        <p className="journey-then">
          <strong>{`${hint ? shown.label : `Recommended: ${shown.label}`}.`}</strong> {shown.next}
          {shown.tradeoffs?.length ? (
            <span className="journey-tradeoffs">
              {shown.tradeoffs.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </span>
          ) : null}
        </p>
      ) : null}
    </>
  );
}

/** This stage's questions, one open at a time; answers fold and the next opens. */
export function Questions({
  items,
  answered,
  prefer,
  onAnswer,
  onExample,
  onWhy,
}: {
  items: NeedsYouItem[];
  answered: Answer[];
  /** Opens first while still unanswered: a question you just raised. */
  prefer?: string | null;
  onAnswer: (item: NeedsYouItem, choice: NeedsYouChoice) => void;
  onExample?: OnExample;
  /** Shows a question's evidence. */
  onWhy?: ((id: string) => void) | undefined;
}) {
  const id = useId();
  const [picked, setPicked] = useState<string | null>(null);
  const [last, setLast] = useState<Answer | null>(null);
  const rows = [
    ...answered.map((a) => ({ item: a.item, choice: a.choice })),
    ...items.map((item) => ({ item, choice: undefined })),
  ];
  const fallback = items.find((i) => i.id === prefer) ?? items[0];
  // "" is a question you closed: nothing reopens until you pick one.
  const open =
    picked === "" ? null : rows.some((r) => r.item.id === picked) ? picked : (fallback?.id ?? null);
  // The answered choice unmounts; focus moves to whatever opened next, else stays on the answer.
  useEffect(() => {
    if (last) document.getElementById(`${id}-head-${open ?? last.item.id}`)?.focus();
  }, [last, open, id]);
  return (
    <section className="journey-section" aria-labelledby={id}>
      <h2 id={id} className="page-label">
        Needs you
      </h2>
      <ul className="journey-problems" aria-labelledby={id}>
        {rows.map(({ item, choice }) => {
          const expanded = open === item.id;
          const light = choice ? "done" : "needsYou";
          return (
            <li key={item.id} className="journey-problem" data-light={light}>
              <Panel density="compact" tone={expanded && !choice ? "active" : "quiet"}>
                <button
                  id={`${id}-head-${item.id}`}
                  type="button"
                  className="journey-problem-head"
                  aria-expanded={expanded}
                  aria-controls={`${id}-${item.id}`}
                  onClick={() => setPicked(expanded ? "" : item.id)}
                >
                  <span className="journey-row-icon">
                    <LightIcon light={light} />
                    <span className="journey-sr">{`${lightLabel[light]}: `}</span>
                  </span>
                  <span className="journey-row-text">{item.prompt}</span>
                  <span className="journey-row-meta">
                    {choice ? choice.label : <Badge tone="warning">{kindLabel[item.kind]}</Badge>}
                  </span>
                </button>
                {expanded ? (
                  <div id={`${id}-${item.id}`} className="journey-problem-body">
                    <p className="journey-question-from">
                      {`${kindLabel[item.kind]} from ${item.from} · waiting ${item.waited}`}
                    </p>
                    {item.context ? (
                      <p className="journey-mono journey-problem-where">{item.context}</p>
                    ) : null}
                    {item.blocks ? (
                      <Badge appearance="plain">{`Holds up ${item.blocks}`}</Badge>
                    ) : null}
                    {item.why && onWhy ? (
                      <Button size="sm" variant="ghost" onClick={() => onWhy(item.why as string)}>
                        Why Bezl asks
                      </Button>
                    ) : null}
                    {choice ? (
                      <p className="journey-then">
                        <strong>{`You chose ${choice.label}.`}</strong> {choice.next}
                      </p>
                    ) : (
                      <Choices
                        item={item}
                        onExample={onExample}
                        onAnswer={(c) => {
                          setPicked(null);
                          setLast({ item, choice: c });
                          onExample?.(null);
                          onAnswer(item, c);
                        }}
                      />
                    )}
                  </div>
                ) : null}
              </Panel>
            </li>
          );
        })}
      </ul>
      <p className="journey-sr" role="status">
        {last ? `You chose ${last.choice.label}. ${last.choice.next}` : null}
      </p>
    </section>
  );
}

/** What Bezl's filter did with questions that never reached you; folded. */
export function HandledList({ handled }: { handled: Handled[] }) {
  return (
    <details className="journey-passed journey-handled">
      <summary>{`Bezl handled ${handled.length} without you`}</summary>
      <ul>
        {handled.map((h) => (
          <li key={h.text} className="journey-row" data-light="done">
            <span className="journey-row-icon">
              <LightIcon light="done" />
            </span>
            <span className="journey-row-text">
              {h.text}
              <small>{h.outcome}</small>
            </span>
            <span className="journey-row-meta">{h.by}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export type IntentProps = {
  goal: string;
  impact?: Impact | undefined;
  doneWhen: DoneWhen[];
  decisions: Decision[];
  assumptions: Assumption[];
  /** Assumptions already turned into questions. */
  raised: ReadonlySet<string>;
  onChange?: ((a: Assumption) => void) | undefined;
};

/** What the task is for: the goal, its reach, done-when, your decisions and the agents' guesses. */
export function Intent({
  goal,
  impact,
  doneWhen,
  decisions,
  assumptions,
  raised,
  onChange,
}: IntentProps) {
  const id = useId();
  return (
    <div className="journey-intent">
      <blockquote className="journey-quote">{goal}</blockquote>
      {impact ? (
        <section className="journey-section" aria-labelledby={`${id}-reach`}>
          <h3 id={`${id}-reach`} className="page-label">
            How far it reaches
          </h3>
          <p className="journey-reach">
            <Badge tone={riskTone[impact.risk]}>{`${capital(impact.risk)} risk`}</Badge>{" "}
            {`${impact.reach}. Based on ${impact.from}.`}
          </p>
        </section>
      ) : null}
      {doneWhen.length ? (
        <section className="journey-section">
          <h3 id={`${id}-done`} className="page-label">
            Done when
          </h3>
          <ul aria-labelledby={`${id}-done`}>
            {doneWhen.map((l) => (
              <li key={l.text} className="journey-row" data-light={l.light}>
                <span className="journey-row-icon">
                  <LightIcon light={l.light} />
                  <span className="journey-sr">{`${lightLabel[l.light]}: `}</span>
                </span>
                <span className="journey-row-text">{l.text}</span>
                <span className="journey-row-meta">{l.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="journey-section">
        <h3 id={`${id}-decided`} className="page-label">
          Decided
        </h3>
        {decisions.length ? (
          <ul aria-labelledby={`${id}-decided`}>
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
        ) : (
          <p className="journey-steer-note">Nothing yet. Your answers show up here.</p>
        )}
      </section>
      {assumptions.length ? (
        <section className="journey-section">
          <h3 id={`${id}-assumed`} className="page-label">
            Assumed
          </h3>
          <ul aria-labelledby={`${id}-assumed`}>
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
        </section>
      ) : null}
    </div>
  );
}

/** Tab `${id}-${tab}` controls the panel `${id}-panel`. */
function Tabs({
  id,
  tabs,
  shown,
  onTab,
}: {
  id: string;
  tabs: { id: Part; name: string }[];
  shown: Part;
  onTab: (t: Part) => void;
}) {
  const move = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = tabs.findIndex((t) => t.id === shown);
    const keys: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const to = keys[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length];
    if (!next) return;
    onTab(next.id);
    document.getElementById(`${id}-${next.id}`)?.focus();
  };
  return (
    <div className="journey-tabs" role="tablist" aria-label="Show">
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`${id}-${t.id}`}
          type="button"
          role="tab"
          aria-selected={shown === t.id}
          aria-controls={`${id}-panel`}
          tabIndex={shown === t.id ? 0 : -1}
          onClick={() => onTab(t.id)}
          onKeyDown={move}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}

const blocksText = (blocks: TraceNode[]) =>
  blocks.length === 1
    ? `Holds up: ${blocks[0]?.title}`
    : `Holds up ${blocks.length} done-when lines`;

/** Each step toward the goal that needs you, and what it holds up. */
function Path({
  path,
  focus,
  onFocus,
}: {
  path: Step[];
  focus: string | null;
  onFocus: (id: string | null) => void;
}) {
  const id = useId();
  return (
    <section className="journey-path" aria-labelledby={`${id}-path`}>
      <h3 id={`${id}-path`} className="page-label">
        Your path
      </h3>
      {path.length ? (
        <ol aria-labelledby={`${id}-path`}>
          {path.map(({ node, blocks }) => (
            <li key={node.id}>
              <button
                type="button"
                className="journey-node"
                data-light={node.light}
                aria-pressed={focus === node.id}
                aria-describedby={`${id}-${node.id}`}
                onClick={() => onFocus(focus === node.id ? null : node.id)}
              >
                <span className="journey-row-icon">
                  <LightIcon light={node.light} />
                  <span className="journey-sr">{`${lightLabel[node.light]}: `}</span>
                </span>
                <span className="journey-node-title">{node.title}</span>
                <span id={`${id}-${node.id}`} className="journey-node-meta" aria-hidden="true">
                  {blocksText(blocks)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="journey-steer-note">Nothing on the way to the goal needs you.</p>
      )}
    </section>
  );
}

/** What you picked: what it is, what it holds up, where to see it. */
function Inspector({
  node,
  blocks,
  onSee,
  onTrace,
}: {
  node: TraceNode | undefined;
  blocks: TraceNode[];
  onSee?: (() => void) | undefined;
  onTrace?: (() => void) | undefined;
}) {
  const id = useId();
  return (
    <section className="journey-inspector" aria-labelledby={id}>
      <h3 id={id} className="page-label">
        Selected
      </h3>
      {node ? (
        <>
          <p className="journey-inspector-title" data-light={node.light}>
            <span className="journey-row-icon">
              <LightIcon light={node.light} />
            </span>
            <strong>{node.title}</strong>
          </p>
          <p className="journey-steer-note">{`${lightLabel[node.light]} · ${node.meta}`}</p>
          {blocks.length ? (
            <>
              <h4 id={`${id}-blocks`} className="page-label">
                Holds up
              </h4>
              <ul aria-labelledby={`${id}-blocks`}>
                {blocks.map((b) => (
                  <li key={b.id} className="journey-row" data-light={b.light}>
                    <span className="journey-row-icon">
                      <LightIcon light={b.light} />
                    </span>
                    <span className="journey-row-text">{b.title}</span>
                    <span className="journey-row-meta">{b.meta}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="journey-inspector-actions">
            {onSee ? (
              <Button size="sm" variant="secondary" onClick={onSee}>
                See the screen
              </Button>
            ) : null}
            {onTrace ? (
              <Button size="sm" variant="secondary" onClick={onTrace}>
                See the trace
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="journey-steer-note">
          Pick a step, a pin on a screenshot or a box on the map.
        </p>
      )}
    </section>
  );
}

type FullScreenProps = IntentProps & {
  /** Names the dialog: the task's title. */
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: Part;
  onTab: (t: Part) => void;
  trace?: Trace | undefined;
  /** The trace node the chain is drawn from; null lists what needs you. */
  focus: string | null;
  onFocus: (id: string | null) => void;
  shots: Shot[];
  /** An example shown in place of the screenshots while a choice is pointed at. */
  example: Shot | null;
  design: Design;
  /** Spots the stage's questions and bar move to while open. */
  onAsk: (el: HTMLElement | null) => void;
  onBar: (el: HTMLElement | null) => void;
};

/** The parts this stage can show; Intent always. */
export function partsOf(shots: Shot[], example: Shot | null, trace?: Trace): Part[] {
  return [
    ...(shots.length || example ? (["screens"] as const) : []),
    ...(trace ? (["evidence"] as const) : []),
    "intent",
  ];
}

const partName: Record<Part, string> = {
  screens: "Screens",
  evidence: "Evidence",
  intent: "Intent",
};

/** Screens, Evidence and Intent with the window to themselves; path left, selection right. */
export function FullScreen({
  title,
  open,
  onOpenChange,
  tab,
  onTab,
  shots,
  example,
  trace,
  focus,
  onFocus,
  design,
  onAsk,
  onBar,
  ...intent
}: FullScreenProps) {
  const id = useId();
  const portal = usePortalRoot();
  const parts = partsOf(shots, example, trace);
  // The asked-for tab can be missing at this stage: fall back to the evidence, then the intent.
  const shown = parts.includes(tab) ? tab : parts.includes("evidence") ? "evidence" : "intent";
  const path = trace ? pathOf(trace) : [];
  const picked = trace?.nodes.find((n) => n.id === focus);
  const see =
    picked?.shot && shown !== "screens" && shots.some((s) => s.id === picked.shot)
      ? () => {
          design.setPicked(picked.shot);
          onTab("screens");
        }
      : undefined;
  let view: ReactNode = <Intent {...intent} />;
  if (shown === "screens")
    view = (
      <Preview shots={shots} example={example} design={design} wide focus={focus} onPin={onFocus} />
    );
  else if (shown === "evidence" && trace)
    view = <EvidenceMap trace={trace} focus={focus} onFocus={onFocus} />;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <Dialog.Content
          {...(portal ? { container: portal } : {})}
          title={title}
          description={intent.goal}
          className="journey-full"
        >
          <div className="journey-full-head">
            <Tabs
              id={id}
              tabs={parts.map((p) => ({ id: p, name: partName[p] }))}
              shown={shown}
              onTab={onTab}
            />
            <Dialog.Close render={<Button size="sm" variant="secondary" />}>Close</Dialog.Close>
          </div>
          <div className="journey-full-body">
            {trace ? <Path path={path} focus={focus} onFocus={onFocus} /> : null}
            <div
              id={`${id}-panel`}
              className="journey-full-canvas"
              role="tabpanel"
              aria-labelledby={`${id}-${shown}`}
            >
              {view}
            </div>
            <div className="journey-full-side">
              <div ref={onAsk} className="journey-full-ask" />
              {trace ? (
                <Inspector
                  node={picked}
                  blocks={path.find((s) => s.node.id === focus)?.blocks ?? []}
                  onSee={see}
                  onTrace={picked && shown !== "evidence" ? () => onTab("evidence") : undefined}
                />
              ) : null}
            </div>
          </div>
          <div ref={onBar} className="journey-full-bar" />
        </Dialog.Content>
      ) : null}
    </Dialog>
  );
}
