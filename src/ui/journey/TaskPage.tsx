import { Button } from "@kb.ui/react";
import { useId, useRef, useState } from "react";
import { answer, itemsFor, type NeedsYouItem, raise } from "../approvals/model";
import "./journey.css";
import { LightIcon } from "./icons";
import {
  contextOf,
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
import { type Answer, ContextBar, HandledList, Questions, Side, type SideTab } from "./Workbench";

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
      <h2 id={id} className="page-label">
        {section.title}
      </h2>
      <ul>
        {section.rows.map((row) => (
          <RowItem key={row.text} row={row} />
        ))}
      </ul>
    </section>
  );
}

type PaneProps = TaskPageProps & { view: StageView };

function StagePane({ task, stage, view, onStage, onKeep, onNewTask }: PaneProps) {
  // Keeping is the decision Review waits on; once made, the buttons go.
  const keep = stage === "review" && task.stages.review === "needsYou" ? onKeep : undefined;
  return (
    <>
      {view.quote ? <blockquote className="journey-quote">{view.quote}</blockquote> : null}
      {view.problems?.length ? <Problems problems={view.problems} /> : null}
      {view.takes ? <Takes takes={view.takes} steer={stage === "build"} onKeep={keep} /> : null}
      {view.ship ? (
        <Ship
          ship={view.ship}
          shipped={task.stages.ship === "working" || task.stages.ship === "done"}
          onBack={() => onStage("review")}
          onNewTask={onNewTask}
        />
      ) : null}
      {view.sections.map((section) => (
        <SectionList key={section.title} section={section} />
      ))}
      {view.passed?.length ? <Passed rows={view.passed} /> : null}
    </>
  );
}

export type TaskPageProps = StageStripProps & {
  /** Keeps a take on Review, which hands it to Ship. */
  onKeep?: (takeId: string) => void;
  /** The whole queue; this task's items for the open stage show inline. */
  needsYou?: NeedsYouItem[];
  onNeedsYou?: (items: NeedsYouItem[]) => void;
  /** Shows History in the header when given. */
  onHistory?: () => void;
  /** Ship offers it once the pull request is open. */
  onNewTask?: () => void;
};

/** One task: header, stages, context line, status; then the stage beside its intent. */
export function TaskPage({ task, stage, onStage, onHistory, ...rest }: TaskPageProps) {
  const view = task.views[stage];
  const { needsYou, onNeedsYou } = rest;
  const [tab, setTab] = useState<SideTab>("intent");
  const [answered, setAnswered] = useState<Answer[]>([]);
  const [raised, setRaised] = useState<string | null>(null);
  const side = useRef<HTMLDivElement>(null);
  const here = needsYou ? itemsFor(needsYou, task.id, stage) : [];
  const mine = answered.filter((a) => a.item.taskId === task.id);
  const asked = new Set([...(needsYou ?? []), ...mine.map((a) => a.item)].map((i) => i.id));
  const assumptions = task.assumptions ?? [];
  const open = (t: SideTab) => {
    setTab(t);
    side.current?.scrollIntoView?.({ block: "nearest" });
  };
  return (
    <article className="journey page" aria-labelledby={`task-${task.id}`}>
      <header className="page-header">
        <div className="page-title-row">
          <h1 id={`task-${task.id}`} className="page-title">
            {task.title}
          </h1>
          <span className="page-tag">{task.repo}</span>
          {onHistory ? (
            <span className="page-action">
              <Button variant="ghost" size="sm" onClick={onHistory}>
                History
              </Button>
            </span>
          ) : null}
        </div>
        <StageStrip task={task} stage={stage} onStage={onStage} />
        <ContextBar context={contextOf(task)} onOpen={open} />
        <p className="page-status">
          <strong>{view.lead}</strong>
          {view.rest ? ` ${view.rest}` : null}
        </p>
      </header>
      <div className="journey-bench">
        <div className="journey-pane">
          {needsYou &&
          onNeedsYou &&
          (here.length > 0 || mine.some((a) => a.item.stage === stage)) ? (
            <Questions
              key={`questions-${stage}`}
              items={here}
              answered={mine.filter((a) => a.item.stage === stage)}
              prefer={raised}
              onAnswer={(item, choice) => {
                const result = answer(needsYou, item.id, choice.id);
                if (!result) return;
                setAnswered((a) => [...a, { item, choice }]);
                onNeedsYou(result.items);
              }}
            />
          ) : null}
          <StagePane
            key={stage}
            task={task}
            stage={stage}
            view={view}
            onStage={onStage}
            {...rest}
          />
          {view.handled?.length ? <HandledList handled={view.handled} /> : null}
        </div>
        <div ref={side} className="journey-side-wrap">
          <Side
            tab={tab}
            onTab={setTab}
            goal={contextOf(task).goal}
            doneWhen={task.doneWhen ?? []}
            decisions={[
              ...(task.decisions ?? []),
              ...mine.map((a) => ({
                stage: a.item.stage,
                text: `${a.choice.label}. ${a.choice.next}`,
              })),
            ]}
            assumptions={assumptions}
            raised={
              new Set(assumptions.filter((a) => asked.has(`${task.id}-${a.id}`)).map((a) => a.id))
            }
            onChange={
              needsYou && onNeedsYou
                ? (a) => {
                    const item = raise(task, stage, a);
                    setRaised(item.id);
                    onNeedsYou([...needsYou, item]);
                  }
                : undefined
            }
          />
        </div>
      </div>
    </article>
  );
}
