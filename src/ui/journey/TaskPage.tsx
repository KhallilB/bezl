import { Button, Panel, Tooltip } from "@kb.ui/react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { answer, itemsFor, type NeedsYouItem, raise } from "../approvals/model";
import { usePortalRoot } from "../theme/AppTheme";
import "./journey.css";
import { LightIcon } from "./icons";
import {
  contextOf,
  type JourneyTask,
  type Section,
  type StageId,
  type StageView,
  stageIds,
  stageLabel,
  stageLightLabel,
  stageMarker,
} from "./model";
import { Preview, useDesign } from "./Preview";
import {
  Compare,
  FullSlots,
  NextStep,
  Passed,
  Problems,
  RowItem,
  SendBack,
  Ship,
  Takes,
  ToFull,
  useSendBack,
} from "./StageViews";
import { TraceView } from "./TraceView";
import {
  type Answer,
  FullScreen,
  HandledList,
  Intent,
  type Part,
  Questions,
  Summary,
} from "./Workbench";

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
  /** Shows a trace node in Evidence. */
  onWhy?: ((id: string) => void) | undefined;
  /** Shows a screenshot in Screens. */
  onShot?: ((id: string) => void) | undefined;
  /** Screens and Evidence: after the stage's own content, before its bar. */
  children?: ReactNode;
};

const questionCount = (n: number) => (n === 1 ? "the question" : `the ${n} questions`);

function StagePane({
  task,
  stage,
  view,
  onStage,
  onShip,
  onNewTask,
  onWhy,
  onShot,
  asking,
  children,
}: PaneProps) {
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
            : "Stopped. Its copy of your code stays as it was left."}
        </p>
      ) : (
        <>
          <p className="journey-next-text">Bezl won't restart a step on its own.</p>
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
    if (asking)
      return <p className="journey-next-text">{`Answer ${questionCount(asking)} to go on.`}</p>;
    return <p className="journey-next-text">{`Nothing needs you at ${stageLabel[stage]}.`}</p>;
  };
  return (
    <>
      {view.quote ? <blockquote className="journey-quote">{view.quote}</blockquote> : null}
      {view.problems?.length ? <Problems problems={view.problems} onWhy={onWhy} /> : null}
      {view.takes ? <Takes takes={view.takes} steer={stage === "build"} /> : null}
      {view.compare ? (
        <Compare compare={view.compare} shots={view.shots} onShot={onShot} onNode={onWhy} />
      ) : null}
      {view.ship ? <Ship ship={view.ship} opened={opened} /> : null}
      {view.sections.map((section) => (
        <SectionList key={section.title} section={section} />
      ))}
      {view.passed?.length ? <Passed rows={view.passed} /> : null}
      {view.handled?.length ? <HandledList handled={view.handled} /> : null}
      {children}
      <NextStep>{next()}</NextStep>
    </>
  );
}

export type TaskPageProps = StageStripProps & {
  /** Approves the attempt on Review, which hands it to Ship. */
  onShip?: () => void;
  /** The whole queue; this task's items for the open stage show inline. */
  needsYou?: NeedsYouItem[];
  onNeedsYou?: (items: NeedsYouItem[]) => void;
  /** Shows History in the header when given. */
  onHistory?: () => void;
  /** Ship offers it once the pull request is open. */
  onNewTask?: () => void;
  /** Full screen's first tab; Evidence also starts at the first problem. */
  tab?: Part;
  /** Opens full screen. */
  full?: boolean;
};

/** A section of proof below the stage: a heading, a Full screen button, then the view. */
function ProofSection({
  id,
  name,
  onFull,
  children,
}: {
  /** The region's id; its heading takes focus when you are moved here. */
  id: string;
  name: string;
  onFull: () => void;
  children: ReactNode;
}) {
  return (
    <section id={id} className="journey-section journey-part" aria-labelledby={`${id}-name`}>
      <div className="journey-part-head">
        <h2 id={`${id}-name`} className="page-label" tabIndex={-1}>
          {name}
        </h2>
        <Button size="sm" variant="ghost" aria-describedby={`${id}-name`} onClick={onFull}>
          Full screen
        </Button>
      </div>
      {children}
    </section>
  );
}

/** One task: header, stages, summary, status; then one column of the stage and its proof. */
export function TaskPage({
  task,
  stage,
  onStage,
  onHistory,
  tab: first,
  full: startFull = false,
  ...rest
}: TaskPageProps) {
  const id = useId();
  const view = task.views[stage];
  const { needsYou, onNeedsYou } = rest;
  const [tab, setTab] = useState<Part>(first ?? "screens");
  const [full, setFull] = useState(startFull);
  const [intent, setIntent] = useState(false);
  const [focus, setFocus] = useState<string | null>(
    first === "evidence" ? (view.problems?.[0]?.why ?? null) : null,
  );
  const [example, setExample] = useState<string | null>(null);
  const [answered, setAnswered] = useState<Answer[]>([]);
  const [raised, setRaised] = useState<string | null>(null);
  const [jump, setJump] = useState<{ to: Part; n: number } | null>(null);
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
  const part = (p: Part) => `${id}-${p}`;
  // Runs after the render that opens the target, so it exists to scroll to.
  useEffect(() => {
    if (!jump) return;
    const to = `${id}-${jump.to}`;
    document.getElementById(to)?.scrollIntoView?.({ block: "start" });
    document.getElementById(`${to}-name`)?.focus({ preventScroll: true });
  }, [jump, id]);
  const go = (to: Part) => {
    if (to === "intent") setIntent(true);
    setJump((j) => ({ to, n: (j?.n ?? 0) + 1 }));
  };
  const why = task.trace
    ? (node: string) => {
        setFocus(node);
        go("evidence");
      }
    : undefined;
  const showShot = (shot: string) => {
    setExample(null);
    design.setPicked(shot);
    go("screens");
  };
  const openFull = (p: Part) => {
    setTab(p);
    setFull(true);
  };
  const intentProps = {
    goal: contextOf(task).goal,
    impact: task.impact,
    doneWhen: task.doneWhen ?? [],
    decisions: [
      ...(task.decisions ?? []),
      ...mine.map((a) => ({
        stage: a.item.stage,
        text: `${a.choice.label}. ${a.choice.next}`,
      })),
    ],
    assumptions,
    raised: new Set(assumptions.filter((a) => asked.has(`${task.id}-${a.id}`)).map((a) => a.id)),
    onChange:
      needsYou && onNeedsYou
        ? (a: (typeof assumptions)[number]) => {
            const item = raise(task, stage, a);
            setRaised(item.id);
            onNeedsYou([...needsYou, item]);
          }
        : undefined,
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
        <Summary
          context={contextOf(task)}
          impact={task.impact}
          coverage={task.trace?.coverage}
          preview={shots.length > 0}
          trace={Boolean(task.trace)}
          intent={{ open: intent, id: part("intent") }}
          onIntent={() => setIntent(!intent)}
          onGo={go}
        />
        <p className="page-status">
          <strong>{view.lead}</strong>
          {view.rest ? ` ${view.rest}` : null}
        </p>
      </header>
      {intent ? (
        <section
          id={part("intent")}
          className="journey-intent-part"
          aria-labelledby={`${part("intent")}-name`}
        >
          <Panel className="journey-intent-panel">
            <h2 id={`${part("intent")}-name`} className="page-label" tabIndex={-1}>
              Intent
            </h2>
            <Intent {...intentProps} />
          </Panel>
        </section>
      ) : null}
      <FullSlots.Provider value={slots}>
        <div className="journey-pane">
          {needsYou &&
          onNeedsYou &&
          (here.length > 0 || mine.some((a) => a.item.stage === stage)) ? (
            <ToFull to="ask">
              <Questions
                key={`questions-${stage}`}
                items={here}
                answered={mine.filter((a) => a.item.stage === stage)}
                prefer={raised}
                onWhy={why}
                onExample={setExample}
                onAnswer={(item, choice) => {
                  const result = answer(needsYou, item.id, choice.id);
                  if (!result) return;
                  setAnswered((a) => [...a, { item, choice }]);
                  onNeedsYou(result.items);
                }}
              />
            </ToFull>
          ) : null}
          <StagePane
            key={stage}
            task={task}
            stage={stage}
            view={view}
            onStage={onStage}
            onWhy={why}
            onShot={showShot}
            asking={here.length}
            {...rest}
          >
            {shots.length || shown ? (
              <ProofSection id={part("screens")} name="Screens" onFull={() => openFull("screens")}>
                <Preview shots={shots} example={shown} design={design} focus={focus} onPin={why} />
              </ProofSection>
            ) : null}
            {task.trace ? (
              <ProofSection
                id={part("evidence")}
                name="Evidence"
                onFull={() => openFull("evidence")}
              >
                <TraceView trace={task.trace} focus={focus} onFocus={setFocus} />
              </ProofSection>
            ) : null}
          </StagePane>
        </div>
        <FullScreen
          title={task.title}
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
          {...intentProps}
        />
      </FullSlots.Provider>
    </article>
  );
}
