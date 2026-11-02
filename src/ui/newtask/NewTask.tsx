import { Button, Fieldset, Input, RadioGroup, Switch, Textarea } from "@kb.ui/react";
import { useId, useRef, useState } from "react";
import {
  type BriefDraft,
  briefFromIssue,
  type CheckId,
  type Choice,
  type CrewProvider,
  type GitHubIssue,
  readiness,
  reviewerChoices,
  type Suggestion,
  suggest,
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
};

const stepLabel = { goal: "Goal", done: "Done when", who: "Who works on it" } as const;
export type NewTaskStep = keyof typeof stepLabel;
const order = Object.keys(stepLabel) as NewTaskStep[];

export type NewTaskProps = {
  repo: string;
  branch: string;
  initial: BriefDraft;
  /** One-click additions per gap; from M6 the code map supplies them. */
  suggestions: Partial<Record<CheckId, Suggestion>>;
  /** Agents that passed the agent check; greyed where they can't take the role. */
  providers: CrewProvider[];
  paths: string[];
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

/** An optional part: its why while empty, and the suggestion one click away. */
function PartField({
  part,
  draft,
  why,
  suggestion,
  onChange,
}: {
  part: Part;
  draft: BriefDraft;
  why: string;
  suggestion: string | undefined;
  onChange: (value: string) => void;
}) {
  const value = draft[part] ?? "";
  const empty = !value.trim();
  return (
    <div className="newtask-part">
      <Input
        label={partLabel[part]}
        value={value}
        onValueChange={onChange}
        {...(empty ? { description: why } : {})}
      />
      {empty && suggestion ? (
        <div className="newtask-suggestion">
          <span>{suggestion}</span>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Use suggestion for ${partLabel[part]}`}
            onClick={() => onChange(suggestion)}
          >
            Use
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

/** The last step's recap: what was written, who works on it, and what's still empty. */
function Summary({
  draft,
  writer,
  reviewer,
  files,
}: {
  draft: BriefDraft;
  writer: string;
  reviewer: string;
  files: number;
}) {
  const gaps = readiness(draft).filter((c) => !c.met);
  const byBezl = draft.doneWhen.filter((d) => d.checker === "bezl").length;
  const done = draft.doneWhen.length;
  return (
    <section className="newtask-summary" aria-labelledby="newtask-summary">
      <h2 id="newtask-summary" className="page-label">
        Your task
      </h2>
      {draft.text.trim() ? <p className="newtask-summary-goal">{draft.text}</p> : null}
      <dl className="newtask-parts">
        <div>
          <dt>Done when</dt>
          <dd>
            {done === 0
              ? "Nothing yet"
              : `${done} ${done === 1 ? "line" : "lines"}, ${byBezl} checked by Bezl`}
          </dd>
        </div>
        <div>
          <dt>Crew</dt>
          <dd>{`${writer} writes, ${reviewer} reviews`}</dd>
        </div>
        <div>
          <dt>Files</dt>
          <dd>{files === 0 ? "Any" : `${files} ${files === 1 ? "path" : "paths"}`}</dd>
        </div>
      </dl>
      {gaps.length > 0 ? (
        <p className="newtask-summary-gaps">
          {`Not filled in: ${gaps.map((g) => lower(g.label)).join(", ")}. You can start anyway; Bezl checks the work against what you wrote.`}
        </p>
      ) : null}
    </section>
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

/** New task in three steps: the goal, how you'll know it's done, then who and within what limits. */
export function NewTask({
  repo,
  branch,
  initial,
  suggestions,
  providers,
  paths,
  onStart,
  step: first = "goal",
  issues,
  issuesOpen = false,
  pickedIssue,
}: NewTaskProps) {
  const [draft, setDraft] = useState(() => {
    const picked = issues?.find((i) => i.number === pickedIssue);
    return picked ? briefFromIssue(picked) : initial;
  });
  const [step, setStep] = useState(first);
  const moved = useRef(false);
  const writers = writerChoices(providers);
  const [writer, setWriter] = useState(() => firstOpen(writers));
  const reviewers = reviewerChoices(providers, writer);
  const [reviewer, setReviewer] = useState(() => defaultReviewer(reviewers));
  const [blockShip, setBlockShip] = useState(false);
  const [allowed, setAllowed] = useState(paths);
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
  const ready = checks.every((c) => c.met);
  const at = order.indexOf(step);
  const go = (to: NewTaskStep) => {
    moved.current = true;
    setStep(to);
  };

  // Each move lands on the new step's question, for keyboard and screen reader alike.
  const land = (el: HTMLHeadingElement | null) => {
    if (!el || !moved.current) return;
    // Once per move: the ref reruns on every render, and typing would lose focus.
    moved.current = false;
    el.focus();
    el.scrollIntoView?.({ block: "nearest" });
  };

  const nameOf = (id: string) => providers.find((p) => p.id === id)?.name ?? id;
  const doneAddition = suggestions.done?.doneWhen;

  return (
    <form
      className="newtask page"
      aria-labelledby="newtask-title"
      onSubmit={(e) => {
        e.preventDefault();
        const to = order[at + 1];
        if (to) go(to);
        else onStart({ draft, writer, reviewer, paths: allowed, blockShip });
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
              gap("what")?.why ?? "In your own words; Bezl keeps it exactly as you wrote it."
            }
            rows={4}
            value={draft.text}
            onValueChange={(text) => setDraft((d) => ({ ...d, text }))}
            placeholder="What should change, and why?"
          />
          <div className="newtask-optional">
            <h3 className="page-label">Optional, but it helps the agent</h3>
            {(["who", "avoid", "example"] as const).map((part) => (
              <PartField
                key={part}
                part={part}
                draft={draft}
                why={why(part)}
                suggestion={suggestions[part]?.[part]}
                onChange={(value) => setDraft((d) => ({ ...d, [part]: value }))}
              />
            ))}
          </div>
        </section>
      ) : null}

      {step === "done" ? (
        <section className="newtask-step" aria-labelledby="newtask-step">
          <h2 id="newtask-step" ref={land} tabIndex={-1} className="newtask-question">
            How will you know it's done?
          </h2>
          <p className="newtask-hint">{why("done")}</p>
          {draft.doneWhen.length > 0 ? (
            <section className="newtask-section" aria-labelledby="newtask-done">
              <h3 id="newtask-done" className="page-label">
                It's done when
              </h3>
              <ul className="newtask-done" aria-labelledby="newtask-done">
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
            </section>
          ) : null}
          {gap("done") && doneAddition?.length ? (
            <div className="newtask-suggestion">
              <span>{`${doneAddition.length} lines from your goal, most of them Bezl can check`}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft((d) => suggest(d, { doneWhen: doneAddition }))}
              >
                {`Add ${doneAddition.length} suggested lines`}
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
        </section>
      ) : null}

      {step === "who" ? (
        <section className="newtask-step" aria-labelledby="newtask-step">
          <h2 id="newtask-step" ref={land} tabIndex={-1} className="newtask-question">
            Who works on it?
          </h2>
          <p className="newtask-hint">
            Only coding agents that passed the agent check, each in its own copy of your code.
          </p>
          <div className="newtask-crew">
            <Choices label="Writes" choices={writers} value={writer} onChange={setWriter} />
            <Choices label="Reviews" choices={reviewers} value={reviewer} onChange={setReviewer} />
          </div>
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
          <Summary
            draft={draft}
            writer={nameOf(writer)}
            reviewer={nameOf(reviewer)}
            files={allowed.length}
          />
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
            : ready
              ? "Start task"
              : "Start anyway"}
        </Button>
        <span>
          {order[at + 1]
            ? `Step ${at + 1} of ${order.length}`
            : "Bezl will set up the task's own copy of your code and then make a plan."}
        </span>
      </footer>
    </form>
  );
}
