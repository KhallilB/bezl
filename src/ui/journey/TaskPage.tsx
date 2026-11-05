import { Button, Tooltip } from "@kb.ui/react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { answer, itemsFor, type NeedsYouItem, raise } from "../approvals/model";
import { usePortalRoot } from "../theme/AppTheme";
import "./journey.css";
import { LightIcon } from "./icons";
import { Lines } from "./Lines";
import {
  contextOf,
  entriesOf,
  firstPick,
  type JourneyTask,
  type Section,
  type StageId,
  type StageView,
  stageIds,
  stageLabel,
  stageLightLabel,
  stageMarker,
} from "./model";
import { useDesign } from "./Preview";
import {
  FullSlots,
  NextStep,
  Passed,
  RowItem,
  SendBack,
  Ship,
  Takes,
  useSendBack,
} from "./StageViews";
import { type Answer, Facts, FullScreen, type MapTab } from "./Workbench";

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
                  <span className="journey-sr">{`, ${stageLightLabel[light]}`}</span>
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

type PaneProps = TaskPageProps & {
  view: StageView;
  asking: number;
  /** The lines: after the stage's own block, before its bar. */
  children?: ReactNode;
};

function StagePane({ task, stage, view, onStage, onShip, onNewTask, asking, children }: PaneProps) {
  // Approving is the decision Review waits on; once made, the button goes.
  const approve = stage === "review" && task.stages.review === "needsYou" ? onShip : undefined;
  const send = useSendBack(view.sendBack);
  const [opened, setOpened] = useState(
    task.stages.ship === "working" || task.stages.ship === "done",
  );
  const [restart, setRestart] = useState<"again" | "stopped" | null>(null);
  const writer = view.takes?.[0]?.model ?? "the writer";
  const next = () => {
    if (view.interrupted) {
      return restart ? (
        <p className="journey-next-text" role="status">
          {restart === "again"
            ? `Started a fresh ${writer} with the task's history and its copy of your code.`
            : "Stopped. Its copy of your code is kept as it was."}
        </p>
      ) : (
        <>
          <Button variant="primary" onClick={() => setRestart("again")}>
            Run the step again
          </Button>
          <Button variant="ghost" onClick={() => setRestart("stopped")}>
            Stop
          </Button>
        </>
      );
    }
    if (view.problems?.length) {
      return (
        <SendBack
          problems={view.problems}
          options={view.sendBack}
          shots={Boolean(view.shots?.length)}
          state={send}
        />
      );
    }
    if (approve && !asking) {
      return (
        <>
          {view.compare ? (
            <p className="journey-next-text">
              <strong>Ready to ship:</strong> {view.compare.summary}
            </p>
          ) : null}
          <Button variant="primary" onClick={approve}>
            Ship it
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
    // Nothing to press: the status line already says what's happening.
    return null;
  };
  const action = next();
  return (
    <>
      {/* The attempt's row matters where you steer it, and where its reviewer speaks. */}
      {view.takes && (stage === "build" || stage === "review") ? (
        <Takes takes={view.takes} steer={stage === "build"} />
      ) : null}
      {view.ship ? <Ship ship={view.ship} opened={opened} /> : null}
      {view.sections.map((section) => (
        <SectionList key={section.title} section={section} />
      ))}
      {view.passed?.length ? <Passed rows={view.passed} /> : null}
      {children}
      {action ? <NextStep>{action}</NextStep> : null}
    </>
  );
}

export type TaskPageProps = StageStripProps & {
  /** Approves the attempt on Review, which hands it to Ship. */
  onShip?: () => void;
  /** The whole queue; this task's items for the open stage show on their lines. */
  needsYou?: NeedsYouItem[];
  onNeedsYou?: (items: NeedsYouItem[]) => void;
  /** Shows History in the header when given. */
  onHistory?: () => void;
  /** Ship offers it once the pull request is open. */
  onNewTask?: () => void;
  /** Opens with the map open. */
  full?: boolean;
};

/** One task: header and goal, the stage's own block, then its lines beside the picked one's detail. */
export function TaskPage({
  task,
  stage,
  onStage,
  onHistory,
  full: startFull = false,
  ...rest
}: TaskPageProps) {
  const view = task.views[stage];
  const { needsYou, onNeedsYou } = rest;
  const [tab, setTab] = useState<MapTab>("map");
  const [full, setFull] = useState(startFull);
  const [focus, setFocus] = useState<string | null>(null);
  const [example, setExample] = useState<string | null>(null);
  const [answered, setAnswered] = useState<Answer[]>([]);
  const [raised, setRaised] = useState<string | null>(null);
  // A pick belongs to its stage; another stage starts from its own default.
  const [pick, setPick] = useState<{ stage: StageId; key: string } | null>(null);
  const [ask, setAsk] = useState<HTMLElement | null>(null);
  const [bar, setBar] = useState<HTMLElement | null>(null);
  const slots = useMemo(() => ({ ask, bar }), [ask, bar]);
  const here = needsYou ? itemsFor(needsYou, task.id, stage) : [];
  const mine = answered.filter((a) => a.item.taskId === task.id);
  const asked = new Set([...(needsYou ?? []), ...mine.map((a) => a.item)].map((i) => i.id));
  const assumptions = task.assumptions ?? [];
  const shots = view.shots ?? [];
  const shown = [...shots, ...(task.examples ?? [])].find((s) => s.id === example) ?? null;
  const design = useDesign(shots);
  const entries = entriesOf(
    task,
    stage,
    here,
    mine.filter((a) => a.item.stage === stage),
  );
  const picked =
    pick?.stage === stage && (pick.key === "" || entries.some((e) => e.key === pick.key))
      ? pick.key
      : firstPick(entries);
  const lineShot = entries.find((e) => e.key === picked)?.shots[0];
  const { setPicked: showShot } = design;
  // The picked line's screenshot shows first.
  useEffect(() => {
    if (lineShot) showShot(lineShot);
  }, [lineShot, showShot]);
  const onMap = task.trace
    ? (node: string | null) => {
        setFocus(node);
        setTab("map");
        setFull(true);
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
        <blockquote className="journey-quote">{contextOf(task).goal}</blockquote>
        <p className="page-status">
          <strong>{view.lead}</strong>
          {view.rest ? ` ${view.rest}` : null}
        </p>
        <Facts context={contextOf(task)} impact={task.impact} coverage={task.trace?.coverage} />
      </header>
      <FullSlots.Provider value={slots}>
        <div className="journey-pane">
          <StagePane
            key={stage}
            task={task}
            stage={stage}
            view={view}
            onStage={onStage}
            asking={here.length}
            {...rest}
          >
            <Lines
              entries={entries}
              picked={picked}
              onPick={(key) => setPick({ stage, key })}
              handled={view.handled}
              shots={shots}
              example={shown}
              design={design}
              prefer={raised}
              onExample={setExample}
              onMap={onMap}
              onAnswer={(item, choice) => {
                if (!needsYou || !onNeedsYou) return;
                const result = answer(needsYou, item.id, choice.id);
                if (!result) return;
                // Stay on this line; the default pick may move once it stops needing you.
                setPick({ stage, key: picked });
                setAnswered((a) => [...a, { item, choice }]);
                onNeedsYou(result.items);
              }}
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
                      setPick({ stage, key: "loose" });
                      onNeedsYou([...needsYou, item]);
                    }
                  : undefined
              }
            />
          </StagePane>
        </div>
        <FullScreen
          title={task.title}
          goal={contextOf(task).goal}
          open={full}
          onOpenChange={setFull}
          tab={tab}
          onTab={setTab}
          shots={shots}
          example={shown}
          trace={task.trace}
          focus={focus}
          onFocus={setFocus}
          design={design}
          onAsk={setAsk}
          onBar={setBar}
        />
      </FullSlots.Provider>
    </article>
  );
}
