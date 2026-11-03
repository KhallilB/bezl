import {
  Badge,
  Button,
  Checkbox,
  Fieldset,
  Input,
  Panel,
  RadioGroup,
  Stat,
  Status,
  Switch,
} from "@kb.ui/react";
import type { ReactNode } from "react";
import { createContext, useContext, useId, useState } from "react";
import { createPortal } from "react-dom";
import { LightIcon, lightTone } from "./icons";
import "./journey.css";
import {
  type CiStatus,
  ciText,
  diffLabel,
  estimate,
  type FileChange,
  lightLabel,
  type Problem,
  type Row,
  type SendBackOptions,
  type ShipSummary,
  stageLabel,
  type Take,
} from "./model";

export function RowItem({ row }: { row: Row }) {
  return (
    <li className="journey-row" data-light={row.light}>
      {row.light ? (
        <span className="journey-row-icon">
          <LightIcon light={row.light} />
          <span className="journey-sr">{`${lightLabel[row.light]}: `}</span>
        </span>
      ) : null}
      <span className={row.mono ? "journey-row-text journey-mono" : "journey-row-text"}>
        {row.text}
      </span>
      {row.meta ? <span className="journey-row-meta">{row.meta}</span> : null}
    </li>
  );
}

export function Files({ files, label }: { files: FileChange[]; label: string }) {
  return (
    <ul className="journey-files" aria-label={label}>
      {files.map((f) => (
        <li key={f.path}>
          <span className="journey-mono">{f.path}</span>
          <span className="journey-row-meta journey-mono">{diffLabel(f)}</span>
        </li>
      ))}
    </ul>
  );
}

function Steer({ model }: { model: string }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <form
      className="journey-steer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setText("");
        setSent(true);
      }}
    >
      <Input
        label={`Message ${model}`}
        visuallyHidden
        value={text}
        onValueChange={setText}
        placeholder={`Tell ${model} what to change`}
      />
      <Button type="submit" variant="secondary">
        Send
      </Button>
      {sent ? (
        <p className="journey-steer-note" role="status">
          {`Sent. ${model} reads it at its next step.`}
        </p>
      ) : null}
    </form>
  );
}

function TakeCard({ take, lone }: { take: Take; lone: boolean }) {
  // One attempt needs no letter; several keep theirs.
  const name = lone ? `${take.model}'s attempt` : `Attempt ${take.id}, ${take.model}`;
  return (
    <article className="journey-take" data-light={take.light} aria-label={name}>
      <Panel className="journey-take-panel">
        <Panel.Header className="journey-take-head">
          {lone ? null : (
            <Badge mono aria-hidden="true">
              {take.id}
            </Badge>
          )}
          <h2>{take.model}</h2>
          <Status
            appearance="chip"
            tone={lightTone[take.light]}
            icon={<LightIcon light={take.light} />}
          >
            {take.state}
          </Status>
        </Panel.Header>
        <Panel.Body className="journey-take-body">
          {take.activity ? <p className="journey-take-activity">{take.activity}</p> : null}
          {take.verdict ? (
            <p className="journey-verdict">
              <strong>{`${take.verdict.by}:`}</strong> {take.verdict.text}
            </p>
          ) : null}
          {take.findings?.length ? (
            <ul className="journey-findings" aria-label={`Issues on ${name}`}>
              {take.findings.map((f) => (
                <li key={f.text} className="journey-row journey-finding" data-light={f.light}>
                  <span className="journey-row-icon">
                    <LightIcon light={f.light} />
                    <span className="journey-sr">{`${lightLabel[f.light]}: `}</span>
                  </span>
                  <span className="journey-row-text">
                    {f.text}
                    {f.where ? <span className="journey-finding-where">{f.where}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {take.files?.length ? (
            <Panel.Well>
              <Files files={take.files} label={`Files ${take.model} changed`} />
            </Panel.Well>
          ) : null}
        </Panel.Body>
      </Panel>
    </article>
  );
}

const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);

/** A row per attempt; each opens its card in place, and Build's message box with a working one. */
export function Takes({ takes, steer }: { takes: Take[]; steer: boolean }) {
  const id = useId();
  const [open, setOpen] = useState<string | null>(null);
  const lone = takes.length === 1;
  return (
    <ul className="journey-takes" aria-label="Attempts">
      {takes.map((t) => {
        const expanded = open === t.id;
        const counts = [
          t.findings?.length ? plural(t.findings.length, "issue") : "",
          t.files?.length ? plural(t.files.length, "file") : "",
        ].filter(Boolean);
        return (
          <li key={t.id} className="journey-take-item" data-light={t.light}>
            <button
              type="button"
              className="journey-take-row"
              aria-expanded={expanded}
              aria-controls={`${id}-${t.id}`}
              onClick={() => setOpen(expanded ? null : t.id)}
            >
              <span className="journey-row-icon">
                <LightIcon light={t.light} />
              </span>
              <span className="journey-take-model">{lone ? t.model : `${t.id} · ${t.model}`}</span>
              <span className="journey-take-state">{t.state}</span>
              <span className="journey-take-line">
                {t.verdict ? `${t.verdict.by}: ${t.verdict.text}` : (t.activity ?? "")}
              </span>
              {counts.length ? (
                <span className="journey-take-counts">{counts.join(" · ")}</span>
              ) : null}
            </button>
            {expanded ? (
              <div id={`${id}-${t.id}`} className="journey-take-open">
                <TakeCard take={t} lone={lone} />
                {steer && t.light === "working" ? <Steer model={t.model} /> : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

const problemCount = (n: number) => (n === 1 ? "1 problem" : `${n} problems`);

/** Problems first, one open at a time with what Bezl saw; one send for all. */
export function Problems({
  problems,
  onWhy,
  level = "h2",
}: {
  problems: Problem[];
  /** Opens the map at a problem. */
  onWhy?: ((id: string) => void) | undefined;
  level?: "h2" | "h3";
}) {
  const id = useId();
  const Heading = level;
  const [open, setOpen] = useState(0);
  return (
    <section className="journey-section" aria-labelledby={id}>
      <Heading id={id} className="page-label">
        Problems
      </Heading>
      <ul className="journey-problems" aria-labelledby={id}>
        {problems.map((p, i) => (
          <li key={p.title} className="journey-problem" data-light="failed">
            <Panel density="compact" tone={open === i ? "critical" : "quiet"}>
              <button
                type="button"
                className="journey-problem-head"
                aria-expanded={open === i}
                aria-controls={`${id}-${i}`}
                onClick={() => setOpen(open === i ? -1 : i)}
              >
                <span className="journey-row-icon">
                  <LightIcon light="failed" />
                </span>
                <span className="journey-row-text">{p.title}</span>
                <span className="journey-row-meta">
                  <Badge tone="danger">{p.kind}</Badge>
                </span>
              </button>
              {open === i ? (
                <div id={`${id}-${i}`} className="journey-problem-body">
                  <p>{p.detail}</p>
                  <span className="journey-mono journey-problem-where">{p.where}</span>
                  <pre className="journey-evidence">{p.evidence.join("\n")}</pre>
                  {p.why && onWhy ? (
                    <Button size="sm" variant="ghost" onClick={() => onWhy(p.why as string)}>
                      Show in the map
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Panel>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Who the problems go to, and how the send reads: "Send 2 problems to Codex". */
function sendText(problems: Problem[]): { what: string; writers: string } {
  return {
    what: problemCount(problems.length),
    writers: [...new Set(problems.map((p) => p.writer))].join(" and "),
  };
}

/** Send-back's choices; held by the stage so the bar can move to full screen and back. */
export function useSendBack(options?: SendBackOptions) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [fixer, setFixer] = useState(options?.fixers[0]?.id ?? "");
  const [checks, setChecks] = useState(options?.checks.map((c) => c.id) ?? []);
  const [carry, setCarry] = useState({ notes: true, shots: true });
  return { open, setOpen, sent, setSent, fixer, setFixer, checks, setChecks, carry, setCarry };
}

/** Send the problems back; Options sets who fixes, what goes and what runs after. */
export function SendBack({
  problems,
  options,
  shots,
  state,
}: {
  problems: Problem[];
  options?: SendBackOptions | undefined;
  /** Stage has screenshots, so they can go too. */
  shots: boolean;
  state: ReturnType<typeof useSendBack>;
}) {
  const id = useId();
  const { what, writers } = sendText(problems);
  const { open, setOpen, sent, setSent, fixer, setFixer, checks, setChecks, carry, setCarry } =
    state;
  const to = options?.fixers.find((f) => f.id === fixer)?.name ?? writers;
  if (sent) {
    return (
      <p className="journey-next-text" role="status">
        {`Sent ${what} to ${to} with what Bezl saw.`}
      </p>
    );
  }
  const est = options ? estimate(options, { fixer, checks }) : null;
  return (
    <>
      {options && est && open ? (
        <div id={id} className="journey-sendback">
          <RadioGroup label="Who fixes" value={fixer} onValueChange={setFixer}>
            {options.fixers.map((f) => (
              <RadioGroup.Item key={f.id} value={f.id}>
                {f.name}
              </RadioGroup.Item>
            ))}
          </RadioGroup>
          <Fieldset legend="What goes with it">
            <Checkbox
              label="What Bezl saw"
              description="What Bezl saw for each problem always goes."
              checked
              disabled
              onCheckedChange={() => {}}
            />
            <Checkbox
              label="Your notes"
              description="The notes you put on the screenshots."
              checked={carry.notes}
              onCheckedChange={(notes) => setCarry({ ...carry, notes })}
            />
            {shots ? (
              <Checkbox
                label="The screenshots"
                checked={carry.shots}
                onCheckedChange={(on) => setCarry({ ...carry, shots: on })}
              />
            ) : null}
          </Fieldset>
          <Fieldset legend="Checks to run after the fix">
            {options.checks.map((c) => (
              <Switch
                key={c.id}
                label={c.label}
                description={c.note}
                checked={checks.includes(c.id)}
                onCheckedChange={(on) =>
                  setChecks(on ? [...checks, c.id] : checks.filter((x) => x !== c.id))
                }
              />
            ))}
          </Fieldset>
          <section className="journey-estimate" aria-label="Estimate">
            <Stat label="Time" value={`About ${est.minutes} min`} />
            <Stat label="Usage" value={est.usage} />
            <Stat label="Files it may change" value={options.paths.join(", ")} />
          </section>
        </div>
      ) : null}
      <Button variant="primary" onClick={() => setSent(true)}>
        {`Send ${what} to ${to}`}
      </Button>
      {options ? (
        <Button
          variant="ghost"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen(!open)}
        >
          Options
        </Button>
      ) : null}
    </>
  );
}

/** Where the picked line's questions and the bar go while the map is open; null keeps them in place. */
export const FullSlots = createContext<{ ask: HTMLElement | null; bar: HTMLElement | null }>({
  ask: null,
  bar: null,
});

export function ToFull({ to, children }: { to: "ask" | "bar"; children: ReactNode }) {
  const slot = useContext(FullSlots)[to];
  return slot ? createPortal(children, slot) : children;
}

/** The stage's one next step, in the same place on every stage. */
export function NextStep({ children }: { children: ReactNode }) {
  return (
    <ToFull to="bar">
      <section className="journey-next" aria-label="Next step">
        <Panel density="compact">
          <div className="journey-next-body">{children}</div>
        </Panel>
      </section>
    </ToFull>
  );
}

export function Passed({ rows }: { rows: Row[] }) {
  return (
    <details className="journey-passed">
      <summary>{`Show ${rows.length} checks that passed`}</summary>
      <ul>
        {rows.map((row) => (
          <RowItem key={row.text} row={row} />
        ))}
      </ul>
    </details>
  );
}

const ciLight = { passed: "done", failed: "failed", running: "working" } as const;
const ciWord = { passed: "Passed", failed: "Failed", running: "Running" } as const;

/** What GitHub reports; Bezl shows it and leaves merging to you. */
function Checks({ ci }: { ci: CiStatus }) {
  const id = useId();
  return (
    <section className="journey-section" aria-labelledby={id}>
      <h3 id={id} className="page-label">
        {ci.on === "merge" ? "Checks on the merged commit" : "Checks on GitHub"}
      </h3>
      <p className="journey-ci-summary">{ciText(ci)}</p>
      <ul className="journey-ci" aria-labelledby={id}>
        {ci.checks.map((c) => (
          <li key={c.name} className="journey-row" data-light={ciLight[c.state]}>
            <span className="journey-row-icon">
              <LightIcon light={ciLight[c.state]} />
            </span>
            <span className="journey-row-text">{c.name}</span>
            <span className="journey-row-meta journey-ci-state">
              {ciWord[c.state]}
              {c.state === "failed" ? (
                <a
                  className="journey-link"
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`View log for ${c.name}`}
                >
                  View log
                </a>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Ship({ ship, opened }: { ship: ShipSummary; opened: boolean }) {
  const id = useId();
  return (
    <section className="journey-ship" aria-labelledby={id}>
      <div className="journey-ship-copy">
        <h2 id={id}>{ship.title}</h2>
        <p>{ship.summary}</p>
        <ul className="journey-facts" aria-label="Facts">
          {ship.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
      {opened && ship.ci ? <Checks ci={ship.ci} /> : null}
      <section className="journey-section" aria-labelledby={`${id}-changed`}>
        <h3 id={`${id}-changed`} className="page-label">
          What changed
        </h3>
        <Files files={ship.files} label="What changed" />
      </section>
      <section className="journey-section" aria-labelledby={`${id}-history`}>
        <h3 id={`${id}-history`} className="page-label">
          How it got here
        </h3>
        <ul className="journey-trail" aria-labelledby={`${id}-history`}>
          {ship.history.map((h) => (
            <li key={h.stage} className="journey-row" data-light="done">
              <span className="journey-row-icon">
                <LightIcon light="done" />
              </span>
              <span className="journey-row-text">
                <strong>{stageLabel[h.stage]}</strong>
                <span className="journey-trail-text">{h.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
