import { Button, Tooltip } from "@kb.ui/react";
import { useId, useRef, useState } from "react";
import { answer, itemsFor, type NeedsYouItem, raise } from "../approvals/model";
import { usePortalRoot } from "../theme/AppTheme";
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
import { Compare, NextStep, Passed, Problems, RowItem, SendBack, Ship, Takes } from "./StageViews";
import { type Answer, HandledList, Questions, Side, type SideTab, Summary } from "./Workbench";

/** What happened at a stage and who acted, for the strip's tooltip. */
function StageHint({ view }: { view: StageView }) {
  return (
    <span className="journey-stage-hint">
      <strong>{view.lead}</strong>
      {view.by ? <span>{view.by}</span> : null}
    </span>
  );
}

type StageStripProps = { task: JourneyTask; stage: StageId; onStage: (stage: StageId) => void };

// A narrow window scrolls the strip; the open stage scrolls into view as it mounts.
const reveal = (el: HTMLButtonElement | null) =>
  el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });

function StageStrip({ task, stage, onStage }: StageStripProps) {
  const portal = usePortalRoot();
  return (
    <nav aria-label="Stages" className="journey-strip">
      <ol>
        {stageIds.map((id, i) => {
          const light = task.stages[id];
          return (
            <li key={id}>
              <Tooltip
                content={<StageHint view={task.views[id]} />}
                {...(portal ? { container: portal } : {})}
              >
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
              </Tooltip>
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

const questionCount = (n: number) => (n === 1 ? "the question" : `the ${n} questions`);

function StagePane({
  task,
  stage,
  view,
  onStage,
  onKeep,
  onNewTask,
  onWhy,
  asking,
}: PaneProps & { onWhy?: ((id: string) => void) | undefined; asking: number }) {
  // Keeping is the decision Review waits on; once made, the buttons go.
  const keep = stage === "review" && task.stages.review === "needsYou" ? onKeep : undefined;
  const [opened, setOpened] = useState(
    task.stages.ship === "working" || task.stages.ship === "done",
  );
  const lean = keep && view.compare ? view.compare.lean : undefined;
  const next = () => {
    if (view.problems?.length) {
      return (
        <SendBack
          problems={view.problems}
          options={view.sendBack}
          shots={Boolean(view.shots?.length)}
        />
      );
    }
    if (lean && keep) {
      return (
        <>
          <p className="journey-next-text">
            <strong>{`Bezl leans to ${lean.take}:`}</strong> {lean.why}
          </p>
          <Button variant="primary" onClick={() => keep(lean.take)}>
            {`Keep attempt ${lean.take}`}
          </Button>
        </>
      );
    }
    if (view.ship) {
      const pr = view.ship.pullRequest;
      return opened ? (
        <>
          <p className="journey-next-text" role="status">
            {view.ship.ci?.on === "merge"
              ? `Pull request #${pr.number} is merged.`
              : `Opened pull request #${pr.number} on GitHub.`}
          </p>
          {onNewTask ? (
            <Button variant="secondary" onClick={onNewTask}>
              New task
            </Button>
          ) : null}
          <a className="journey-link" href={pr.url} target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </>
      ) : (
        <>
          <Button variant="primary" onClick={() => setOpened(true)}>
            Open pull request
          </Button>
          <Button variant="ghost" onClick={() => onStage("review")}>
            Back to review
          </Button>
        </>
      );
    }
    if (keep) return <p className="journey-next-text">Keep one of the attempts above.</p>;
    if (asking)
      return (
        <p className="journey-next-text">{`Answer ${questionCount(asking)} above to go on.`}</p>
      );
    return <p className="journey-next-text">{`Nothing needs you at ${stageLabel[stage]}.`}</p>;
  };
  return (
    <>
      {view.quote ? <blockquote className="journey-quote">{view.quote}</blockquote> : null}
      {view.problems?.length ? <Problems problems={view.problems} onWhy={onWhy} /> : null}
      {view.takes && view.compare ? (
        <Compare takes={view.takes} compare={view.compare} onKeep={keep} />
      ) : view.takes ? (
        <Takes takes={view.takes} steer={stage === "build"} onKeep={keep} />
      ) : null}
      {view.ship ? <Ship ship={view.ship} opened={opened} /> : null}
      {view.sections.map((section) => (
        <SectionList key={section.title} section={section} />
      ))}
      {view.passed?.length ? <Passed rows={view.passed} /> : null}
      {view.handled?.length ? <HandledList handled={view.handled} /> : null}
      <NextStep>{next()}</NextStep>
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
  /** The side tab to open on; Preview when the stage has screenshots. */
  side?: SideTab;
};

/** One task: header, stages, context line, status; then the stage beside its intent. */
export function TaskPage({ task, stage, onStage, onHistory, side: first, ...rest }: TaskPageProps) {
  const view = task.views[stage];
  const { needsYou, onNeedsYou } = rest;
  const [tab, setTab] = useState<SideTab>(first ?? "preview");
  const [focus, setFocus] = useState<string | null>(
    first === "trace" ? (view.problems?.[0]?.why ?? null) : null,
  );
  const [example, setExample] = useState<string | null>(null);
  const [answered, setAnswered] = useState<Answer[]>([]);
  const [raised, setRaised] = useState<string | null>(null);
  const side = useRef<HTMLDivElement>(null);
  const here = needsYou ? itemsFor(needsYou, task.id, stage) : [];
  const mine = answered.filter((a) => a.item.taskId === task.id);
  const asked = new Set([...(needsYou ?? []), ...mine.map((a) => a.item)].map((i) => i.id));
  const assumptions = task.assumptions ?? [];
  const shots = view.shots ?? [];
  const shown = [...shots, ...(task.examples ?? [])].find((s) => s.id === example) ?? null;
  const open = (t: SideTab) => {
    setTab(t);
    side.current?.scrollIntoView?.({ block: "nearest" });
  };
  const why = task.trace
    ? (id: string) => {
        setFocus(id);
        open("trace");
      }
    : undefined;
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
        <Summary
          context={contextOf(task)}
          impact={task.impact}
          coverage={task.trace?.coverage}
          preview={shots.length > 0}
          trace={Boolean(task.trace)}
          onOpen={open}
        />
        <p className="page-status">
          <strong>{view.lead}</strong>
          {view.rest ? ` ${view.rest}` : null}
        </p>
      </header>
      <div
        className="journey-bench"
        data-wide={tab === "preview" && (shots.length || shown) ? "" : undefined}
      >
        <div className="journey-pane">
          {needsYou &&
          onNeedsYou &&
          (here.length > 0 || mine.some((a) => a.item.stage === stage)) ? (
            <Questions
              key={`questions-${stage}`}
              items={here}
              answered={mine.filter((a) => a.item.stage === stage)}
              prefer={raised}
              onWhy={why}
              onExample={(id) => {
                setExample(id);
                if (id) setTab("preview");
              }}
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
            onWhy={why}
            asking={here.length}
            {...rest}
          />
        </div>
        <div ref={side} className="journey-side-wrap">
          <Side
            tab={tab}
            onTab={setTab}
            shots={shots}
            example={shown}
            trace={task.trace}
            focus={focus}
            onFocus={setFocus}
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
