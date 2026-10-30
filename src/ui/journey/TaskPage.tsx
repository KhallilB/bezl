import { useId } from "react";
import "./journey.css";
import { LightIcon } from "./icons";
import {
  type JourneyTask,
  lightLabel,
  type Section,
  type StageId,
  type StageView,
  stageIds,
  stageLabel,
  stageMarker,
} from "./model";

type StageStripProps = { task: JourneyTask; stage: StageId; onStage: (stage: StageId) => void };

// A narrow window scrolls the strip; the open stage scrolls into view as it mounts.
const reveal = (el: HTMLButtonElement | null) =>
  el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });

function StageStrip({ task, stage, onStage }: StageStripProps) {
  return (
    <nav aria-label="Stages" className="journey-strip">
      <ol>
        {stageIds.map((id, i) => {
          const light = task.stages[id];
          return (
            <li key={id}>
              <button
                type="button"
                ref={id === stage ? reveal : undefined}
                className="journey-stage"
                data-light={light}
                aria-current={id === stage ? "step" : undefined}
                onClick={() => onStage(id)}
              >
                <span className="journey-marker" aria-hidden="true">
                  {light === "waiting" ? stageMarker(light, i) : <LightIcon light={light} />}
                </span>
                {stageLabel[id]}
                <span className="journey-sr">{`, ${lightLabel[light]}`}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SectionList({ section }: { section: Section }) {
  const id = useId();
  return (
    <section className="journey-section" aria-labelledby={id}>
      <h2 id={id}>{section.title}</h2>
      <ul>
        {section.rows.map((row) => (
          <li key={row.text} className="journey-row" data-light={row.light}>
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
        ))}
      </ul>
    </section>
  );
}

function StagePane({ view }: { view: StageView }) {
  return (
    <div className="journey-pane">
      {view.quote ? <blockquote className="journey-quote">{view.quote}</blockquote> : null}
      {view.sections.map((section) => (
        <SectionList key={section.title} section={section} />
      ))}
    </div>
  );
}

export type TaskPageProps = StageStripProps;

/** One task: its header, the stage strip, one status sentence and the open stage. */
export function TaskPage({ task, stage, onStage }: TaskPageProps) {
  const view = task.views[stage];
  return (
    <article className="journey" aria-labelledby={`task-${task.id}`}>
      <header className="journey-header">
        <div className="journey-title">
          <h1 id={`task-${task.id}`}>{task.title}</h1>
          <span className="journey-repo">{task.repo}</span>
        </div>
        <StageStrip task={task} stage={stage} onStage={onStage} />
        <p className="journey-status">
          <strong>{view.lead}</strong>
          {view.rest ? ` ${view.rest}` : null}
        </p>
      </header>
      <StagePane key={stage} view={view} />
    </article>
  );
}
