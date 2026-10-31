import { Button, Input } from "@kb.ui/react";
import { useId, useState } from "react";
import { LightIcon } from "./icons";
import "./journey.css";
import {
  diffLabel,
  type FileChange,
  lightLabel,
  type Problem,
  type Row,
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
        label={`Steer ${model}`}
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

function TakeCard({ take, onKeep }: { take: Take; onKeep?: ((id: string) => void) | undefined }) {
  return (
    <article
      className="journey-take"
      data-light={take.light}
      aria-label={`Take ${take.id}, ${take.model}`}
    >
      <header className="journey-take-head">
        <span className="journey-take-letter" aria-hidden="true">
          {take.id}
        </span>
        <h2>{take.model}</h2>
        <span className="journey-take-state">
          <LightIcon light={take.light} />
          {take.state}
        </span>
      </header>
      {take.activity ? <p className="journey-take-activity">{take.activity}</p> : null}
      {take.verdict ? (
        <p className="journey-verdict">
          <strong>{`${take.verdict.by}:`}</strong> {take.verdict.text}
        </p>
      ) : null}
      {take.findings?.length ? (
        <ul className="journey-findings" aria-label={`Findings on take ${take.id}`}>
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
        <Files files={take.files} label={`Files take ${take.id} changed`} />
      ) : null}
      {onKeep ? (
        <footer className="journey-take-actions">
          <Button variant="secondary" onClick={() => onKeep(take.id)}>
            {`Keep take ${take.id}`}
          </Button>
        </footer>
      ) : null}
    </article>
  );
}

/** Takes side by side; Build adds the steer box under a working take. */
export function Takes({
  takes,
  steer,
  onKeep,
}: {
  takes: Take[];
  steer: boolean;
  onKeep?: ((id: string) => void) | undefined;
}) {
  const writing = steer ? takes.find((t) => t.light === "working") : undefined;
  return (
    <div className="journey-takes-wrap">
      <div className="journey-takes">
        {takes.map((t) => (
          <TakeCard key={t.id} take={t} onKeep={onKeep} />
        ))}
      </div>
      {writing ? <Steer model={writing.model} /> : null}
    </div>
  );
}

/** Problems first, one open at a time with what Bezl saw. */
export function Problems({ problems }: { problems: Problem[] }) {
  const id = useId();
  const [open, setOpen] = useState(0);
  const [sent, setSent] = useState<ReadonlySet<number>>(new Set());
  return (
    <section className="journey-section" aria-labelledby={id}>
      <h2 id={id}>Problems</h2>
      <ul className="journey-problems" aria-labelledby={id}>
        {problems.map((p, i) => (
          <li key={p.title} className="journey-problem" data-light="failed">
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
              <span className="journey-row-meta">{p.kind}</span>
            </button>
            {open === i ? (
              <div id={`${id}-${i}`} className="journey-problem-body">
                <p>{p.detail}</p>
                <span className="journey-mono journey-problem-where">{p.where}</span>
                <pre className="journey-evidence">{p.evidence.join("\n")}</pre>
                {sent.has(i) ? (
                  <p className="journey-steer-note" role="status">
                    {`Sent to ${p.writer} with this evidence.`}
                  </p>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSent((s) => new Set(s).add(i))}
                  >
                    {`Send to ${p.writer}`}
                  </Button>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
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

export function Ship({ ship, onBack }: { ship: ShipSummary; onBack: () => void }) {
  const id = useId();
  const [opened, setOpened] = useState(false);
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
      <section className="journey-section" aria-labelledby={`${id}-changed`}>
        <h3 id={`${id}-changed`}>What changed</h3>
        <Files files={ship.files} label="What changed" />
      </section>
      <section className="journey-section" aria-labelledby={`${id}-history`}>
        <h3 id={`${id}-history`}>How it got here</h3>
        <ul className="journey-history" aria-labelledby={`${id}-history`}>
          {ship.history.map((h) => (
            <li key={h.stage} className="journey-row" data-light="done">
              <span className="journey-row-icon">
                <LightIcon light="done" />
              </span>
              <span className="journey-row-text">
                <strong>{stageLabel[h.stage]}</strong>
                <span className="journey-history-text">{h.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <div className="journey-ship-actions">
        {opened ? (
          <p className="journey-steer-note" role="status">
            Opened pull request #42 on GitHub.
          </p>
        ) : (
          <Button variant="secondary" onClick={() => setOpened(true)}>
            Open pull request
          </Button>
        )}
        <Button variant="ghost" onClick={onBack}>
          Back to review
        </Button>
      </div>
    </section>
  );
}
