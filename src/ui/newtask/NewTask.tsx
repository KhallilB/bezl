import { Button, Fieldset, Input, RadioGroup, Switch, Textarea } from "@kb.ui/react";
import { type ReactNode, useId, useRef, useState } from "react";
import {
  applyRead,
  type BezlRead,
  type BriefDraft,
  briefFromIssue,
  type CheckId,
  type Choice,
  type CrewProvider,
  type GitHubIssue,
  readiness,
  reviewerChoices,
  withIssue,
  withoutIssue,
  writerChoices,
} from "./model";
import "./newtask.css";

export type StartedTask = {
  draft: BriefDraft;
  writer: string;
  reviewer: string;
  paths: string[];
  /** Off by default: Ship warns about open problems but lets you go ahead. */
  blockShip: boolean;
  /** Runs the repository's setup command in the task's copy before planning. */
  setup: boolean;
};

const stepLabel = { goal: "Goal", review: "Review and start" } as const;
export type NewTaskStep = keyof typeof stepLabel;
const order = Object.keys(stepLabel) as NewTaskStep[];

export type NewTaskProps = {
  repo: string;
  branch: string;
  initial: BriefDraft;
  /** What Bezl took from the goal and the code; from M6 the code map supplies it. */
  read: BezlRead;
  /** Agents that passed the agent check; greyed where they can't take the role. */
  providers: CrewProvider[];
  /** The repository's setup command, if it has one; shown beside Start. */
  setup?: string | undefined;
  onStart: (task: StartedTask) => void;
  /** The step it opens on, for the walkthrough. */
  step?: NewTaskStep;
  /** Open issues from your `gh` session; absent without a GitHub sign-in or remote. */
  issues?: GitHubIssue[];
  /** For the walkthrough: the list starts open, or with this issue already picked. */
  issuesOpen?: boolean;
  pickedIssue?: number;
};

const firstOpen = (choices: Choice[]) => choices.find((c) => !c.disabled)?.id ?? "";

// Prefer a second vendor's eyes; the writer's own vendor is the fallback.
const defaultReviewer = (choices: Choice[]) =>
  choices.find((c) => !c.disabled && !c.note)?.id ?? firstOpen(choices);

function StepBar({ step }: { step: NewTaskStep }) {
  const at = order.indexOf(step);
  return (
    <ol className="newtask-steps" aria-label="New task steps">
      {order.map((id, i) => (
        <li
          key={id}
          aria-current={i === at ? "step" : undefined}
          data-state={i < at ? "done" : i === at ? "current" : "next"}
        >
          {stepLabel[id]}
        </li>
      ))}
    </ol>
  );
}

type Part = "who" | "avoid" | "example";
const partLabel: Record<Part, string> = {
  who: "Who it's for",
  avoid: "Avoid or reuse",
  example: "Example",
};

/** A part Bezl read: where it came from, or that it couldn't tell; yours to change or drop. */
function PartField({
  part,
  draft,
  why,
  read,
  onChange,
}: {
  part: Part;
  draft: BriefDraft;
  why: string;
  read: BezlRead["who"];
  onChange: (value: string) => void;
}) {
  const value = draft[part] ?? "";
  const empty = !value.trim();
  const label = partLabel[part];
  return (
    <div className="newtask-part">
      <Input label={label} value={value} onValueChange={onChange} />
      <div className="newtask-read">
        {empty && read ? (
          <>
            <span>{`Bezl read: ${read.text}`}</span>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Use Bezl's read for ${label}`}
              onClick={() => onChange(read.text)}
            >
              Use
            </Button>
          </>
        ) : null}
        {empty && !read ? <span>{why}</span> : null}
        {empty ? null : (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Drop ${label}`}
            onClick={() => onChange("")}
          >
            Drop
          </Button>
        )}
      </div>
    </div>
  );
}

const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One part of the task: what it holds and where from; Change opens it in place. */
function Row({
  label,
  value,
  from,
  open,
  onChange,
  children,
}: {
  label: string;
  value: ReactNode;
  from?: string | undefined;
  open: boolean;
  onChange: () => void;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <li className="newtask-row" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="newtask-row-label">
        {label}
      </span>
      <div className="newtask-row-value">
        {value}
        {from ? (
          <span className="newtask-from">
            From <cite>{from}</cite>
          </span>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`${open ? "Done" : "Change"} ${label}`}
        aria-expanded={children ? open : undefined}
        aria-controls={children && open ? `${id}-edit` : undefined}
        onClick={onChange}
      >
        {open ? "Done" : "Change"}
      </Button>
      {children && open ? (
        <div id={`${id}-edit`} className="newtask-row-edit">
          {children}
        </div>
      ) : null}
    </li>
  );
}

function Choices({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: Choice[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <RadioGroup label={label} value={value} onValueChange={onChange} className="newtask-choices">
      {choices.map((c) => (
        <RadioGroup.Item key={c.id} value={c.id} disabled={Boolean(c.disabled)}>
          <span className="newtask-choice">
            <span>{c.label}</span>
            {c.disabled ? <span className="newtask-choice-note">{c.disabled}</span> : null}
            {c.note && c.id === value ? (
              <span className="newtask-choice-note" data-tone="warning">
                {c.note}
              </span>
            ) : null}
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup>
  );
}

function IssuePicker({
  repo,
  issues,
  initialOpen,
  picked,
  onPick,
  onClear,
}: {
  repo: string;
  issues: GitHubIssue[];
  initialOpen: boolean;
  picked: BriefDraft["issue"];
  onPick: (issue: GitHubIssue) => void;
  onClear: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(initialOpen);
  if (picked)
    return (
      <div className="newtask-issue-picked">
        <p role="status">
          {`Filled in from issue #${picked.number}. Change anything you like before you start. `}
          <a href={picked.url} target="_blank" rel="noreferrer">
            {`View issue #${picked.number}`}
          </a>
        </p>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Start from scratch
        </Button>
      </div>
    );
  return (
    <div className="newtask-issues">
      <Button
        size="sm"
        variant="secondary"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        Start from a GitHub issue
      </Button>
      {open ? (
        <section id={id} className="newtask-issue-list" aria-labelledby={`${id}-title`}>
          <h2 id={`${id}-title`} className="page-label">
            {`Open issues in ${repo}`}
          </h2>
          <p>
            Pick one and Bezl fills in the goal from it. You can still change anything before you
            start.
          </p>
          <ul aria-labelledby={`${id}-title`}>
            {issues.map((issue) => (
              <li key={issue.number}>
                <button
                  type="button"
                  className="newtask-issue"
                  onClick={() => {
                    setOpen(false);
                    onPick(issue);
                  }}
                >
                  <span className="newtask-issue-number">{`#${issue.number}`}</span>
                  <span>{issue.title}</span>
                  {issue.labels?.length ? (
                    <span className="newtask-issue-labels">{issue.labels.join(", ")}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** New task in two steps: your goal, then Bezl's read of the whole task to change or start as it is. */
export function NewTask({
  repo,
  branch,
  initial,
  read,
  providers,
  setup,
  onStart,
  step: first = "goal",
  issues,
  issuesOpen = false,
  pickedIssue,
}: NewTaskProps) {
  // Bezl reads once, as you leave the goal; after that the parts are yours.
  const applied = useRef(first !== "goal");
  const [draft, setDraft] = useState(() => {
    const picked = issues?.find((i) => i.number === pickedIssue);
    const start = picked ? briefFromIssue(picked) : initial;
    return applied.current ? applyRead(start, read) : start;
  });
  const [step, setStep] = useState(first);
  const [open, setOpen] = useState<string | null>(null);
  const moved = useRef(false);
  const writers = writerChoices(providers);
  const [writer, setWriter] = useState(() => firstOpen(writers));
  const reviewers = reviewerChoices(providers, writer);
  const [reviewer, setReviewer] = useState(() => defaultReviewer(reviewers));
  const [blockShip, setBlockShip] = useState(false);
  const [runSetup, setRunSetup] = useState(Boolean(setup));
  const [allowed, setAllowed] = useState(read.files?.paths ?? []);
  const [adding, setAdding] = useState("");
  const [line, setLine] = useState("");
  const add = () => {
    const path = adding.trim();
    if (path && !allowed.includes(path)) setAllowed([...allowed, path]);
    setAdding("");
  };
  const addLine = () => {
    const text = line.trim();
    if (text && !draft.doneWhen.some((d) => d.text === text))
      setDraft((d) => ({ ...d, doneWhen: [...d.doneWhen, { text, checker: "you" }] }));
    setLine("");
  };
  const issueOf = (d: BriefDraft) => issues?.find((i) => i.number === d.issue?.number);
  const checks = readiness(draft);
  const gap = (id: CheckId) => checks.find((c) => c.id === id && !c.met);
  const why = (id: CheckId) => checks.find((c) => c.id === id)?.why ?? "";
  const gaps = checks.filter((c) => !c.met);
  const at = order.indexOf(step);
  const go = (to: NewTaskStep) => {
    if (to === "review" && !applied.current) {
      applied.current = true;
      setDraft((d) => applyRead(d, read));
    }
    moved.current = true;
    setOpen(null);
    setStep(to);
  };
  const toggle = (row: string) => setOpen(open === row ? null : row);

  // Each move lands on the new step's question, for keyboard and screen reader alike.
  const land = (el: HTMLHeadingElement | null) => {
    if (!el || !moved.current) return;
    // Once per move: the ref reruns on every render, and typing would lose focus.
    moved.current = false;
    el.focus();
    el.scrollIntoView?.({ block: "nearest" });
  };

  const nameOf = (id: string) => providers.find((p) => p.id === id)?.name ?? id;
  const bezlLines = read.done?.lines ?? [];
  const byBezl = draft.doneWhen.filter((d) => d.checker === "bezl").length;
  const sameVendor = reviewers.find((c) => c.id === reviewer)?.note;
  const willSetup = Boolean(setup) && runSetup;

  return (
    <form
      className="newtask page"
      aria-labelledby="newtask-title"
      onSubmit={(e) => {
        e.preventDefault();
        const to = order[at + 1];
        if (to) go(to);
        else onStart({ draft, writer, reviewer, paths: allowed, blockShip, setup: willSetup });
      }}
    >
      <header className="page-title-row">
        <h1 id="newtask-title" className="page-title">
          New task
        </h1>
        <span className="page-tag">{`${repo} · ${branch}`}</span>
      </header>
      <StepBar step={step} />

      {step === "goal" ? (
        <section className="newtask-step" aria-labelledby="newtask-step">
          <h2 id="newtask-step" ref={land} tabIndex={-1} className="newtask-question">
            What should change?
          </h2>
          {issues?.length ? (
            <IssuePicker
              repo={repo}
              issues={issues}
              initialOpen={issuesOpen}
              picked={draft.issue}
              onPick={(issue) => setDraft((d) => withIssue(d, issue, issueOf(d)))}
              onClear={() => setDraft((d) => withoutIssue(d, issueOf(d)))}
            />
          ) : null}
          <Textarea
            label="Goal"
            description={
              gap("what")?.why ??
              "In your own words. Bezl reads the rest from it and the code, for you to check next."
            }
            rows={4}
            value={draft.text}
            onValueChange={(text) => setDraft((d) => ({ ...d, text }))}
            placeholder="What should change, and why?"
          />
        </section>
      ) : null}

      {step === "review" ? (
        <section className="newtask-step" aria-labelledby="newtask-step">
          <h2 id="newtask-step" ref={land} tabIndex={-1} className="newtask-question">
            Here's the task Bezl read
          </h2>
          <p className="newtask-hint">
            {`From your goal and the code in ${repo}. Start it as it is, or change any part to keep the work on tighter rails.`}
          </p>
          <ul className="newtask-rows" aria-label="Your task">
            <Row
              label="Goal"
              value={<span className="newtask-row-goal">{draft.text || "Not written yet"}</span>}
              open={false}
              onChange={() => go("goal")}
            />
            {(["who", "avoid", "example"] as const).map((part) => {
              const value = draft[part]?.trim();
              const bezl = read[part];
              return (
                <Row
                  key={part}
                  label={partLabel[part]}
                  value={
                    value ? (
                      <span>{value}</span>
                    ) : (
                      <span className="newtask-row-empty">
                        {bezl ? "Dropped" : "Bezl couldn't tell from the goal or the code."}
                      </span>
                    )
                  }
                  from={value && bezl && value === bezl.text ? bezl.from : undefined}
                  open={open === part}
                  onChange={() => toggle(part)}
                >
                  <PartField
                    part={part}
                    draft={draft}
                    why={why(part)}
                    read={bezl}
                    onChange={(v) => setDraft((d) => ({ ...d, [part]: v }))}
                  />
                </Row>
              );
            })}
            <Row
              label="It's done when"
              value={
                <span>
                  {draft.doneWhen.length === 0
                    ? "Nothing yet"
                    : `${count(draft.doneWhen.length, "line", "lines")}, ${byBezl} checked by Bezl`}
                </span>
              }
              from={read.done && byBezl > 0 ? read.done.from : undefined}
              open={open === "done"}
              onChange={() => toggle("done")}
            >
              <p className="newtask-hint">{why("done")}</p>
              {draft.doneWhen.length > 0 ? (
                <ul className="newtask-done" aria-label="Done-when lines">
                  {draft.doneWhen.map((d) => (
                    <li key={d.text} data-checker={d.checker}>
                      <span>{d.text}</span>
                      <span className="newtask-checker">
                        {d.checker === "bezl" ? "Bezl checks" : "You check"}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${d.text}`}
                        onClick={() =>
                          setDraft((x) => ({
                            ...x,
                            doneWhen: x.doneWhen.filter((y) => y.text !== d.text),
                          }))
                        }
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {gap("done") && bezlLines.length ? (
                <div className="newtask-suggestion">
                  <span>{`Bezl read ${count(bezlLines.length, "line", "lines")} from your goal`}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDraft((d) => applyRead(d, { done: { lines: bezlLines, from: "" } }))
                    }
                  >
                    Use them
                  </Button>
                </div>
              ) : null}
              <div className="newtask-path-add">
                <Input
                  label="Add a line"
                  visuallyHidden
                  className="newtask-path-field"
                  value={line}
                  onValueChange={setLine}
                  placeholder="Add a line you'll check yourself"
                  onKeyDown={(e) => {
                    // Enter adds the line instead of moving on.
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    addLine();
                  }}
                />
                <Button size="sm" variant="secondary" onClick={addLine} disabled={!line.trim()}>
                  Add line
                </Button>
              </div>
            </Row>
            <Row
              label="Crew"
              value={<span>{`${nameOf(writer)} writes, ${nameOf(reviewer)} reviews`}</span>}
              from={
                sameVendor
                  ? undefined
                  : "the agents that passed the agent check, with a reviewer from another company"
              }
              open={open === "crew"}
              onChange={() => toggle("crew")}
            >
              <div className="newtask-crew">
                <Choices label="Writes" choices={writers} value={writer} onChange={setWriter} />
                <Choices
                  label="Reviews"
                  choices={reviewers}
                  value={reviewer}
                  onChange={setReviewer}
                />
              </div>
            </Row>
            <Row
              label="Files"
              value={
                <span>
                  {`${allowed.length === 0 ? "Any file" : count(allowed.length, "path", "paths")} · ${blockShip ? "Ship waits for open problems" : "Ship isn't held"}`}
                </span>
              }
              from={
                read.files && allowed.join() === read.files.paths.join()
                  ? read.files.from
                  : undefined
              }
              open={open === "files"}
              onChange={() => toggle("files")}
            >
              <Fieldset legend="Limits" className="newtask-scope">
                <section className="newtask-section" aria-labelledby="newtask-paths">
                  <h3 id="newtask-paths" className="newtask-field">
                    Files it may change
                  </h3>
                  <ul className="newtask-paths" aria-labelledby="newtask-paths">
                    {allowed.map((p) => (
                      <li key={p}>
                        {p}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${p}`}
                          onClick={() => setAllowed(allowed.filter((a) => a !== p))}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="newtask-path-add">
                    <Input
                      label="Add a path"
                      visuallyHidden
                      className="newtask-path-field"
                      value={adding}
                      onValueChange={setAdding}
                      placeholder="src/components/**"
                      onKeyDown={(e) => {
                        // Enter adds the path instead of starting the task.
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        add();
                      }}
                    />
                    <Button size="sm" variant="secondary" onClick={add} disabled={!adding.trim()}>
                      Add path
                    </Button>
                  </div>
                </section>
                <Switch
                  label="Don't ship with open problems"
                  description="While this is off, Ship lists any open problems but still lets you go ahead."
                  checked={blockShip}
                  onCheckedChange={setBlockShip}
                />
              </Fieldset>
            </Row>
            {setup ? (
              <Row
                label="Setup"
                value={
                  runSetup ? (
                    <>
                      <code>{setup}</code>
                      <span className="newtask-from">
                        Runs only in the task's copy of your code, never in yours
                      </span>
                    </>
                  ) : (
                    <span className="newtask-row-empty">Skipped</span>
                  )
                }
                open={open === "setup"}
                onChange={() => toggle("setup")}
              >
                <Switch
                  label="Run setup when the task starts"
                  description="Off, the task starts without installing anything, and checks that need dependencies may fail."
                  checked={runSetup}
                  onCheckedChange={setRunSetup}
                />
              </Row>
            ) : null}
          </ul>
          {gaps.length > 0 ? (
            <p className="newtask-summary-gaps">
              {`Not filled in: ${gaps.map((g) => lower(g.label)).join(", ")}. You can start anyway; Bezl checks the work against what's here.`}
            </p>
          ) : null}
        </section>
      ) : null}

      <footer className="newtask-actions newtask-start">
        {at > 0 ? (
          <Button variant="ghost" onClick={() => go(order[at - 1] ?? "goal")}>
            Back
          </Button>
        ) : null}
        <Button type="submit" variant="primary">
          {order[at + 1]
            ? `Next: ${stepLabel[order[at + 1] as NewTaskStep]}`
            : gaps.length === 0
              ? "Start task"
              : "Start anyway"}
        </Button>
        <span>
          {order[at + 1]
            ? `Step ${at + 1} of ${order.length}`
            : willSetup
              ? `Starting runs ${setup} in the task's copy of your code, then Bezl makes a plan.`
              : "Bezl will set up the task's own copy of your code and then make a plan."}
        </span>
      </footer>
    </form>
  );
}
