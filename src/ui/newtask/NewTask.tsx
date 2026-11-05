import { Button, Callout, Fieldset, Input, RadioGroup, Switch, Textarea } from "@kb.ui/react";
import { type ReactNode, useEffect, useId, useState } from "react";
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
  /** Opens Coding agents; offered when no agent can write. */
  onAgents?: () => void;
  /** Opens with Bezl's read already shown, for the walkthrough. */
  withRead?: boolean;
  /** Open issues from your `gh` session; absent without a GitHub sign-in or remote. */
  issues?: GitHubIssue[];
  /** For the walkthrough: the list starts open, or with this issue already picked. */
  issuesOpen?: boolean;
  pickedIssue?: number;
};

/** Long enough to read a finished thought, short enough to feel instant. */
const READ_DELAY_MS = 400;

const firstOpen = (choices: Choice[]) => choices.find((c) => !c.disabled)?.id ?? "";

// Prefer a second vendor's eyes; the writer's own vendor is the fallback.
const defaultReviewer = (choices: Choice[]) =>
  choices.find((c) => !c.disabled && !c.note)?.id ?? firstOpen(choices);

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

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One part of the task; Change opens it in place, with where Bezl got it. */
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
      <div className="newtask-row-value">{value}</div>
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
          {from ? (
            <span className="newtask-from">
              From <cite>{from}</cite>
            </span>
          ) : null}
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
          {"From "}
          <a href={picked.url} target="_blank" rel="noreferrer">
            {`issue #${picked.number}`}
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

/** New task on one screen: your goal, then Bezl's read of it below, then Start. */
export function NewTask({
  repo,
  branch,
  initial,
  read,
  providers,
  setup,
  onStart,
  onAgents,
  withRead = false,
  issues,
  issuesOpen = false,
  pickedIssue,
}: NewTaskProps) {
  // Bezl reads once, shortly after the goal has words; after that the parts are yours.
  const [hasRead, setHasRead] = useState(withRead);
  const [draft, setDraft] = useState(() => {
    const picked = issues?.find((i) => i.number === pickedIssue);
    const start = picked ? briefFromIssue(picked) : initial;
    return withRead ? applyRead(start, read) : start;
  });
  const [open, setOpen] = useState<string | null>(null);
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
  const toggle = (row: string) => setOpen(open === row ? null : row);
  const written = draft.text.trim().length > 0;
  useEffect(() => {
    if (hasRead || !written) return;
    const t = setTimeout(() => {
      setDraft((d) => applyRead(d, read));
      setHasRead(true);
    }, READ_DELAY_MS);
    return () => clearTimeout(t);
  }, [hasRead, written, read]);

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
        if (!written || !writer) return;
        // Started before the read showed: start with it anyway.
        const brief = hasRead ? draft : applyRead(draft, read);
        onStart({ draft: brief, writer, reviewer, paths: allowed, blockShip, setup: willSetup });
      }}
    >
      <header className="page-title-row">
        <h1 id="newtask-title" className="page-title">
          New task
        </h1>
        <span className="page-tag">{`${repo} · ${branch}`}</span>
      </header>
      <section className="newtask-step" aria-labelledby="newtask-goal">
        <h2 id="newtask-goal" className="newtask-question">
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
          rows={4}
          value={draft.text}
          onValueChange={(text) => setDraft((d) => ({ ...d, text }))}
          placeholder="What should change, and why?"
        />
      </section>

      {hasRead ? (
        <section className="newtask-step" aria-labelledby="newtask-read">
          <h2 id="newtask-read" className="newtask-question">
            Bezl's read
          </h2>
          <ul className="newtask-rows" aria-label="Your task">
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
                      <span className="newtask-row-empty">{bezl ? "Dropped" : "Not found"}</span>
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
                  : "the agents that are ready, with a reviewer from a different company"
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
                  {`${allowed.length === 0 ? "Any file" : `Only ${count(allowed.length, "path", "paths")}`}${blockShip ? " · Won't ship with open problems" : ""}`}
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
                    <code>{setup}</code>
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
        </section>
      ) : null}

      {writer ? null : (
        <Callout tone="warning" title="No coding agent can write yet">
          {onAgents ? (
            <Button size="sm" variant="secondary" onClick={onAgents}>
              Open Coding agents
            </Button>
          ) : null}
        </Callout>
      )}
      <footer className="newtask-actions newtask-start">
        <Button type="submit" variant="primary" disabled={!written || !writer}>
          {hasRead && gaps.length > 0 ? "Start anyway" : "Start task"}
        </Button>
      </footer>
    </form>
  );
}
