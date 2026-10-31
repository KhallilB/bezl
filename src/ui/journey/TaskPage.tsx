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
import { Passed, Problems, RowItem, Ship, Takes } from "./StageViews";

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
          <RowItem key={row.text} row={row} />
        ))}
      </ul>
    </section>
  );
}

type PaneProps = TaskPageProps & { view: StageView };

function StagePane({ task, stage, view, onStage, onKeep }: PaneProps) {
  // Keeping is the decision Review waits on; once made, the buttons go.
  const keep = stage === "review" && task.stages.review === "needsYou" ? onKeep : undefined;
  return (
    <div className="journey-pane">
      {view.quote ? <blockquote className="journey-quote">{view.quote}</blockquote> : null}
      {view.problems?.length ? <Problems problems={view.problems} /> : null}
      {view.takes ? <Takes takes={view.takes} steer={stage === "build"} onKeep={keep} /> : null}
      {view.ship ? <Ship ship={view.ship} onBack={() => onStage("review")} /> : null}
      {view.sections.map((section) => (
        <SectionList key={section.title} section={section} />
      ))}
      {view.passed?.length ? <Passed rows={view.passed} /> : null}
    </div>
  );
}

export type TaskPageProps = StageStripProps & {
  /** Keeps a take on Review, which hands it to Ship. */
  onKeep?: (takeId: string) => void;
};

/** One task: its header, the stage strip, one status sentence and the open stage. */
export function TaskPage({ task, stage, onStage, onKeep }: TaskPageProps) {
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
      <StagePane
        key={stage}
        task={task}
        stage={stage}
        view={view}
        onStage={onStage}
        {...(onKeep ? { onKeep } : {})}
      />
    </article>
  );
}
