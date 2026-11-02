import { Badge, Button, Panel, Tooltip } from "@kb.ui/react";
import { type KeyboardEvent, useEffect, useId, useState } from "react";
import { kindLabel, type NeedsYouChoice, type NeedsYouItem } from "../approvals/model";
import { usePortalRoot } from "../theme/AppTheme";
import { LightIcon } from "./icons";
import {
  type Assumption,
  type Coverage,
  type Decision,
  type DoneWhen,
  type Handled,
  type Impact,
  lightLabel,
  type Shot,
  stageLabel,
  type TaskContext,
  type Trace,
} from "./model";
import { Preview } from "./Preview";
import { TraceView } from "./TraceView";

export type SideTab = "preview" | "trace" | "intent";

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
  onOpen,
}: {
  context: TaskContext;
  impact?: Impact | undefined;
  coverage?: Coverage | undefined;
  /** This stage has screenshots, so the change opens them. */
  preview: boolean;
  /** Bezl measured something, so the evidence opens its trace. */
  trace: boolean;
  onOpen: (tab: SideTab) => void;
}) {
  const portal = usePortalRoot();
  const total = coverage
    ? coverage.covered + coverage.uncovered + coverage.unknown + coverage.excluded
    : 0;
  const open = (tab: SideTab, text: string, on: boolean) =>
    on ? (
      <Button size="sm" variant="ghost" onClick={() => onOpen(tab)}>
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
          {open(
            "intent",
            context.lines ? `${context.proven} of ${context.lines} done` : "No checks yet",
            true,
          )}
        </Tooltip>
      </li>
      <li>
        <span className="journey-eyebrow">Change</span>
        {open("preview", context.touches, preview)}
        {impact ? (
          <>
            <Badge tone={riskTone[impact.risk]}>{`${capital(impact.risk)} risk`}</Badge>
            <span className="journey-summary-note">{impact.reach}</span>
          </>
        ) : null}
      </li>
      <li>
        <span className="journey-eyebrow">Evidence</span>
        {open(
          "trace",
          coverage && total
            ? `${coverage.covered} of ${total} lines run in a test`
            : context.evidence,
          trace,
        )}
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
  /** Opens the trace at a question's evidence. */
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
  const open = rows.some((r) => r.item.id === picked) ? picked : (fallback?.id ?? null);
  // The answered choice unmounts; focus moves to whatever opened next.
  useEffect(() => {
    if (last) document.getElementById(`${id}-head-${open}`)?.focus();
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

type IntentProps = {
  goal: string;
  doneWhen: DoneWhen[];
  decisions: Decision[];
  assumptions: Assumption[];
  /** Assumptions already turned into questions. */
  raised: ReadonlySet<string>;
  onChange?: ((a: Assumption) => void) | undefined;
};

function Intent({ goal, doneWhen, decisions, assumptions, raised, onChange }: IntentProps) {
  const id = useId();
  return (
    <div className="journey-intent">
      <blockquote className="journey-quote">{goal}</blockquote>
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
          <p className="journey-steer-note">Nothing yet. Your answers collect here.</p>
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

type SideProps = IntentProps & {
  tab: SideTab;
  onTab: (t: SideTab) => void;
  trace?: Trace | undefined;
  /** The trace node the chain is drawn from; null lists what needs you. */
  focus: string | null;
  onFocus: (id: string | null) => void;
  shots: Shot[];
  /** An example to show in place of the screenshots while a choice is pointed at. */
  example: Shot | null;
};

/** Beside every stage: what it looks like and what it's for, kept in view while you decide. */
export function Side({ tab, onTab, shots, example, trace, focus, onFocus, ...intent }: SideProps) {
  const id = useId();
  const tabs: { id: SideTab; name: string }[] = [
    ...(shots.length || example ? [{ id: "preview" as const, name: "Preview" }] : []),
    ...(trace ? [{ id: "trace" as const, name: "Trace" }] : []),
    { id: "intent", name: "Intent" },
  ];
  const shown = tabs.some((t) => t.id === tab) ? tab : "intent";
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
    <aside className="journey-side" aria-labelledby={`${id}-evidence`}>
      <h2 id={`${id}-evidence`} className="page-label">
        Evidence
      </h2>
      <Panel>
        <Panel.Header>
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
        </Panel.Header>
        <Panel.Body
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-${shown}`}
          className="journey-side-panel"
        >
          {shown === "preview" ? (
            <Preview shots={shots} example={example} />
          ) : shown === "trace" && trace ? (
            <TraceView trace={trace} focus={focus} onFocus={onFocus} />
          ) : (
            <Intent {...intent} />
          )}
        </Panel.Body>
      </Panel>
    </aside>
  );
}
