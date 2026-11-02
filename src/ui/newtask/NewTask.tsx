import { Button, Fieldset, RadioGroup, Switch, Textarea } from "@kb.ui/react";
import { useId, useState } from "react";
import { LightIcon } from "../journey/icons";
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
  /** Scrolls a part into view, for the walkthrough. */
  focus?: "crew";
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

function preview(addition: Suggestion) {
  if (addition.doneWhen) return `${addition.doneWhen.length} done checks`;
  return addition.who ?? addition.avoid ?? addition.example ?? "";
}

function Readiness({
  draft,
  suggestions,
  onAdd,
}: {
  draft: BriefDraft;
  suggestions: NewTaskProps["suggestions"];
  onAdd: (addition: Suggestion) => void;
}) {
  const id = useId();
  const checks = readiness(draft);
  const gaps = checks.filter((c) => !c.met).length;
  return (
    <aside className="newtask-readiness" aria-labelledby={`${id}-title`}>
      <div className="newtask-readiness-head">
        <h2 id={`${id}-title`}>Is the task ready?</h2>
        <span>{gaps === 0 ? "Ready" : `${checks.length - gaps} of ${checks.length}`}</span>
      </div>
      <ul aria-labelledby={`${id}-title`}>
        {checks.map((c) => {
          const addition = c.met ? undefined : suggestions[c.id];
          return (
            <li
              key={c.id}
              className="newtask-check"
              data-met={c.met ? "" : undefined}
              aria-labelledby={`${id}-${c.id}`}
              aria-describedby={`${id}-${c.id}-state`}
            >
              <span className="newtask-check-icon">
                <LightIcon light={c.met ? "done" : "waiting"} />
              </span>
              <span id={`${id}-${c.id}`} className="newtask-check-label">
                {c.label}
              </span>
              <span id={`${id}-${c.id}-state`} className="newtask-sr">
                {c.met ? "present" : "missing"}
              </span>
              {c.met ? null : <p className="newtask-check-why">{c.why}</p>}
              {addition ? (
                <div className="newtask-suggestion">
                  <span>{preview(addition)}</span>
                  <Button size="sm" variant="ghost" onClick={() => onAdd(addition)}>
                    Add
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function Parts({ draft }: { draft: BriefDraft }) {
  const parts = [
    ["Who it's for", draft.who],
    ["Avoid or reuse", draft.avoid],
    ["Example", draft.example],
  ].filter((p): p is [string, string] => Boolean(p[1]?.trim()));
  return (
    <>
      {parts.length > 0 ? (
        <dl className="newtask-parts">
          {parts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {draft.doneWhen.length > 0 ? (
        <section className="newtask-section" aria-labelledby="newtask-done">
          <h2 id="newtask-done" className="page-label">
            It's done when
          </h2>
          <ul className="newtask-done" aria-labelledby="newtask-done">
            {draft.doneWhen.map((d) => (
              <li key={d.text} data-checker={d.checker}>
                <span>{d.text}</span>
                <span className="newtask-checker">
                  {d.checker === "bezl" ? "Bezl checks" : "You check"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
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

const emptyBrief: BriefDraft = { text: "", doneWhen: [] };

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

/** New task: the goal in your words, checked as you type, then who writes and who reviews. */
export function NewTask({
  repo,
  branch,
  initial,
  suggestions,
  providers,
  paths,
  onStart,
  focus,
  issues,
  issuesOpen = false,
  pickedIssue,
}: NewTaskProps) {
  const [draft, setDraft] = useState(() => {
    const picked = issues?.find((i) => i.number === pickedIssue);
    return picked ? briefFromIssue(picked) : initial;
  });
  const writers = writerChoices(providers);
  const [writer, setWriter] = useState(() => firstOpen(writers));
  const reviewers = reviewerChoices(providers, writer);
  const [reviewer, setReviewer] = useState(() => defaultReviewer(reviewers));
  const [blockShip, setBlockShip] = useState(false);
  const ready = readiness(draft).every((c) => c.met);

  return (
    <form
      className="newtask page"
      aria-labelledby="newtask-title"
      onSubmit={(e) => {
        e.preventDefault();
        onStart({ draft, writer, reviewer, paths, blockShip });
      }}
    >
      <header className="page-title-row">
        <h1 id="newtask-title" className="page-title">
          New task
        </h1>
        <span className="page-tag">{`${repo} · ${branch}`}</span>
      </header>

      <div className="newtask-define">
        <div className="newtask-main">
          {issues?.length ? (
            <IssuePicker
              repo={repo}
              issues={issues}
              initialOpen={issuesOpen}
              picked={draft.issue}
              onPick={(issue) => setDraft(briefFromIssue(issue))}
              onClear={() => setDraft(emptyBrief)}
            />
          ) : null}
          <Textarea
            label="Goal"
            description="Write it in your own words, and Bezl keeps it exactly as you wrote it."
            rows={4}
            value={draft.text}
            onValueChange={(text) => setDraft((d) => ({ ...d, text }))}
            placeholder="What should change, and why?"
          />
          <Parts draft={draft} />
        </div>
        <Readiness
          draft={draft}
          suggestions={suggestions}
          onAdd={(addition) => setDraft((d) => suggest(d, addition))}
        />
      </div>

      <Fieldset
        legend="Who works on it"
        description="You can only choose coding agents that passed the agent check, and each one works in its own copy of your code."
        className="newtask-crew"
        ref={focus === "crew" ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
      >
        <Choices label="Writes" choices={writers} value={writer} onChange={setWriter} />
        <Choices label="Reviews" choices={reviewers} value={reviewer} onChange={setReviewer} />
      </Fieldset>

      <Fieldset legend="Limits" className="newtask-scope">
        <section className="newtask-section" aria-labelledby="newtask-paths">
          <h2 id="newtask-paths" className="newtask-field">
            Files it may change
          </h2>
          <ul className="newtask-paths" aria-labelledby="newtask-paths">
            {paths.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
        <Switch
          label="Don't ship with open problems"
          description="While this is off, Ship lists any open problems but still lets you go ahead."
          checked={blockShip}
          onCheckedChange={setBlockShip}
        />
      </Fieldset>

      <footer className="newtask-actions newtask-start">
        <Button type="submit" variant="secondary">
          {ready ? "Start task" : "Start anyway"}
        </Button>
        <span>
          {ready
            ? "Bezl will set up the task's own copy of your code and then make a plan."
            : "You can start with gaps, and Bezl will check the work against whatever you wrote."}
        </span>
      </footer>
    </form>
  );
}
