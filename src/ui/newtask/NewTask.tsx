import { Button, Fieldset, RadioGroup, Switch, Textarea } from "@kb.ui/react";
import { useId, useState } from "react";
import { LightIcon } from "../journey/icons";
import {
  type BriefDraft,
  type CheckId,
  type Choice,
  type CrewProvider,
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
  /** Providers that passed preflight, greyed where they cannot take the role. */
  providers: CrewProvider[];
  paths: string[];
  onStart: (task: StartedTask) => void;
  /** Scrolls a part into view, for the walkthrough. */
  focus?: "crew";
};

const firstOpen = (choices: Choice[]) => choices.find((c) => !c.disabled)?.id ?? "";

// Prefer a second vendor's eyes; the writer's own vendor is the fallback.
const defaultReviewer = (choices: Choice[]) =>
  choices.find((c) => !c.disabled && !c.note)?.id ?? firstOpen(choices);

function preview(addition: Suggestion) {
  if (addition.doneWhen) return `${addition.doneWhen.length} checks`;
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
        <h2 id={`${id}-title`}>Brief readiness</h2>
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
    ["Who it is for", draft.who],
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
          <h2 id="newtask-done">Done when</h2>
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

/** New task: the brief in your words, checked as you type, then who writes and who reviews. */
export function NewTask({
  repo,
  branch,
  initial,
  suggestions,
  providers,
  paths,
  onStart,
  focus,
}: NewTaskProps) {
  const [draft, setDraft] = useState(initial);
  const writers = writerChoices(providers);
  const [writer, setWriter] = useState(() => firstOpen(writers));
  const reviewers = reviewerChoices(providers, writer);
  const [reviewer, setReviewer] = useState(() => defaultReviewer(reviewers));
  const [blockShip, setBlockShip] = useState(false);
  const ready = readiness(draft).every((c) => c.met);

  return (
    <form
      className="newtask"
      aria-labelledby="newtask-title"
      onSubmit={(e) => {
        e.preventDefault();
        onStart({ draft, writer, reviewer, paths, blockShip });
      }}
    >
      <header className="newtask-header">
        <h1 id="newtask-title">New task</h1>
        <span className="newtask-repo">{`${repo} · ${branch}`}</span>
      </header>

      <div className="newtask-brief">
        <div className="newtask-main">
          <Textarea
            label="Brief"
            description="In your own words. Bezl keeps them as written."
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
        legend="Crew"
        description="Only providers that passed preflight. Each works in its own worktree."
        className="newtask-crew"
        ref={focus === "crew" ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
      >
        <Choices label="Writes" choices={writers} value={writer} onChange={setWriter} />
        <Choices label="Reviews" choices={reviewers} value={reviewer} onChange={setReviewer} />
      </Fieldset>

      <Fieldset legend="Scope" className="newtask-scope">
        <section className="newtask-section" aria-labelledby="newtask-paths">
          <h2 id="newtask-paths">Allowed paths</h2>
          <ul className="newtask-paths" aria-labelledby="newtask-paths">
            {paths.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
        <Switch
          label="Open problems block Ship"
          description="Off: Ship lists open problems and lets you go ahead."
          checked={blockShip}
          onCheckedChange={setBlockShip}
        />
      </Fieldset>

      <footer className="newtask-actions">
        <Button type="submit" variant="secondary">
          {ready ? "Start task" : "Start anyway"}
        </Button>
        <span>
          {ready
            ? "Bezl prepares a worktree, then plans."
            : "Gaps are fine; Bezl checks against what you wrote."}
        </span>
      </footer>
    </form>
  );
}
