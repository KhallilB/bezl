import { Button, Menu, Tooltip } from "@kb.ui/react";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { Approvals } from "../approvals/Approvals";
import { needsYou } from "../approvals/fixtures";
import type { NeedsYouItem } from "../approvals/model";
import { history } from "../history/fixtures";
import { HistoryPage } from "../history/HistoryPage";
import { interruptedTasks, keptTasks, shippedTasks, tasks, usage } from "../journey/fixtures";
import type { JourneyTask, StageId } from "../journey/model";
import { TaskPage } from "../journey/TaskPage";
import type { SideTab } from "../journey/Workbench";
import { crew, drafts, issues, paths, read, startedTask } from "../newtask/fixtures";
import { NewTask } from "../newtask/NewTask";
import { SetupConfirm } from "../newtask/SetupConfirm";
import { ChooseRepository } from "../onboarding/ChooseRepository";
import {
  claudeFound,
  codexReady,
  githubSignedIn,
  githubSignedOut,
  noWriter,
  thisMachine,
} from "../providers/fixtures";
import type { GitHubCheck, ProviderCheck } from "../providers/model";
import { Providers } from "../providers/Providers";
import { AppShell, EmptyTasks } from "../shell/AppShell";
import { task } from "../task/fixtures";
import type { WorkerView } from "../task/model";
import { Task } from "../task/Task";
import { usePortalRoot } from "../theme/AppTheme";
import { BackIcon, ContentsIcon, MoonIcon, NextIcon, SunIcon } from "./icons";
import { type Scene, sceneWorkers, type Theme } from "./states";
import {
  chapters,
  keyAction,
  type Preflight,
  parseTour,
  step,
  steps,
  type Tour,
  type TourAction,
  type TourView,
  tourSearch,
} from "./tour";
import "./walkthrough.css";

/** Puts the theme on <html> so portals and the page canvas follow; restores it on leave. */
export function useDocumentTheme(theme: Theme) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const before = root.dataset.theme;
    root.dataset.theme = theme;
    return () => {
      if (before === undefined) delete root.dataset.theme;
      else root.dataset.theme = before;
    };
  }, [theme]);
}

/** The interim Task screen in one scene; a stop lasts until the scene remounts. */
export function StateScene({ scene }: { scene: Scene }) {
  const [workers, setWorkers] = useState<WorkerView[]>(sceneWorkers[scene]);
  return (
    <Task
      task={task}
      workers={workers}
      onStop={(id) =>
        setWorkers((all) =>
          all.map((w) =>
            w.id === id ? { ...w, state: "finished", summary: "You stopped it." } : w,
          ),
        )
      }
    />
  );
}

function Hint({ label, keys, children }: { label: string; keys?: string; children: ReactElement }) {
  const portal = usePortalRoot();
  return (
    <Tooltip
      content={
        <span className="walkthrough-hint">
          {label}
          {keys ? <kbd>{keys}</kbd> : null}
        </span>
      }
      side="top"
      {...(portal ? { container: portal } : {})}
    >
      {children}
    </Tooltip>
  );
}

type DockProps = { tour: Tour; act: (action: TourAction) => void; jump: (index: number) => void };

function Dock({ tour, act, jump }: DockProps) {
  const portal = usePortalRoot();
  const current = steps[tour.index] ?? steps[0];
  const next: Theme = tour.theme === "dark" ? "light" : "dark";
  if (!current) return null;
  return (
    <section className="walkthrough-dock" aria-label="Walkthrough">
      <div className="walkthrough-copy" aria-live="polite">
        <span className="walkthrough-meta">
          <span>{current.chapter}</span>
          <span>{`${tour.index + 1} of ${steps.length}`}</span>
        </span>
        <span className="walkthrough-title">{current.title}</span>
        <span className="walkthrough-note">{current.note}</span>
      </div>
      <div className="walkthrough-controls">
        <Hint label="Back" keys="←">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back"
            aria-keyshortcuts="ArrowLeft"
            disabled={tour.index === 0}
            onClick={() => act({ type: "step", by: -1 })}
          >
            <BackIcon />
          </Button>
        </Hint>
        <Hint label="Next" keys="→">
          <Button
            className="walkthrough-next"
            variant="secondary"
            aria-keyshortcuts="ArrowRight"
            disabled={tour.index === steps.length - 1}
            onClick={() => act({ type: "step", by: 1 })}
          >
            Next
            <NextIcon />
          </Button>
        </Hint>
        <span className="walkthrough-separator" aria-hidden="true" />
        <Hint label={`Switch to ${next}`} keys="T">
          <Button
            variant="ghost"
            size="icon"
            aria-label={next === "light" ? "Light theme" : "Dark theme"}
            aria-keyshortcuts="T"
            onClick={() => act({ type: "theme" })}
          >
            {next === "light" ? <SunIcon /> : <MoonIcon />}
          </Button>
        </Hint>
        <Menu>
          <Menu.Trigger render={<Button variant="ghost" size="icon" aria-label="Contents" />}>
            <ContentsIcon />
          </Menu.Trigger>
          <Menu.Content
            side="top"
            align="end"
            className="walkthrough-contents"
            {...(portal ? { container: portal } : {})}
          >
            {chapters.map((chapter, c) => (
              <div key={chapter} role="none">
                {c > 0 ? <Menu.Separator /> : null}
                <span className="walkthrough-chapter" role="none">
                  {chapter}
                </span>
                {steps.map((s, i) =>
                  s.chapter === chapter ? (
                    <Menu.Item
                      key={s.id}
                      className="walkthrough-entry"
                      data-current={i === tour.index ? "" : undefined}
                      onClick={() => jump(i)}
                    >
                      <span className="walkthrough-entry-n" aria-hidden="true">
                        {i + 1}
                      </span>
                      {s.title}
                    </Menu.Item>
                  ) : null,
                )}
              </div>
            ))}
          </Menu.Content>
        </Menu>
      </div>
    </section>
  );
}

// Arrow keys belong to fields, menus and dialogs while they hold focus.
function ownsKeys(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
      target.closest('[role="menu"], [role="dialog"], [role="alertdialog"]') !== null)
  );
}

type Place = { taskId: string; stage: StageId };

/** The queue and the moves every screen after the first task shares. */
type Shared = {
  queue: NeedsYouItem[];
  onQueue: (items: NeedsYouItem[]) => void;
  onPlace: (place: Place) => void;
  onGoTo: (id: string) => void;
};

/** The shell once tasks exist: the list, its lights and Approvals with its count. */
function TasksShell({
  list,
  current,
  shared,
  children,
}: {
  list: JourneyTask[];
  current: string | "approvals";
  shared: Shared;
  children: ReactNode;
}) {
  return (
    <AppShell
      tasks={list}
      usage={usage}
      currentTaskId={current}
      approvals={{
        count: shared.queue.length,
        current: current === "approvals",
        onOpen: () => shared.onGoTo("approvals"),
      }}
      onOpenTask={(taskId) => {
        const next = list.find((t) => t.id === taskId);
        if (next) shared.onPlace({ taskId, stage: next.current });
      }}
    >
      {children}
    </AppShell>
  );
}

type TaskViewProps = {
  place: Place;
  kept: boolean;
  shipped?: "checking" | "merged" | undefined;
  side?: SideTab | undefined;
  full?: boolean | undefined;
  interrupted?: boolean | undefined;
  shared: Shared;
};

function TaskView({ place, kept, shipped, side, full, interrupted, shared }: TaskViewProps) {
  const list = shipped
    ? shippedTasks[shipped]
    : kept
      ? keptTasks
      : interrupted
        ? interruptedTasks
        : tasks;
  const open = list.find((t) => t.id === place.taskId) ?? list[0];
  if (!open) return null;
  return (
    <TasksShell list={list} current={open.id} shared={shared}>
      <TaskPage
        key={`${open.id}-${side ?? ""}-${full ? "full" : ""}`}
        task={open}
        stage={place.stage}
        onStage={(stage) => shared.onPlace({ ...place, stage })}
        onShip={() => shared.onGoTo("ship")}
        onNewTask={() => shared.onGoTo("new-task")}
        needsYou={shared.queue}
        onNeedsYou={shared.onQueue}
        {...(side ? { side } : {})}
        {...(full ? { full } : {})}
        {...((kept || shipped) && open.id === history.taskId
          ? { onHistory: () => shared.onGoTo("history") }
          : {})}
      />
    </TasksShell>
  );
}

const preflight: Record<
  Exclude<Preflight, "checking">,
  { checks: ProviderCheck[]; github: GitHubCheck }
> = {
  ready: { checks: [claudeFound, codexReady], github: githubSignedIn },
  noGitHub: { checks: [claudeFound, codexReady], github: githubSignedOut },
  impostor: { checks: thisMachine, github: githubSignedIn },
  noWriter: { checks: noWriter, github: githubSignedIn },
};

function View({
  view,
  place,
  onPlace,
  onGoTo,
  queue,
  onQueue,
}: {
  view: TourView;
  place: Place | null;
  onPlace: (place: Place) => void;
  /** Answers made on this step; null until the first. */
  queue: NeedsYouItem[] | null;
  onQueue: (items: NeedsYouItem[]) => void;
  /** Moves the tour to a step by id, as a click in a screen would. */
  onGoTo: (id: string) => void;
}) {
  const shared: Shared = {
    queue: queue ?? (view.kind === "approvals" && view.cleared ? [] : needsYou),
    onQueue,
    onPlace,
    onGoTo,
  };
  switch (view.kind) {
    case "choose":
      return (
        <ChooseRepository
          onChoose={() => onGoTo("preflight")}
          {...(view.refused
            ? { refused: { path: "~/Downloads", reason: "Not a git repository" } }
            : {})}
        />
      );
    case "providers":
      return view.result === "checking" ? (
        <Providers checks={null} checking github={null} firstRun />
      ) : (
        <Providers
          {...preflight[view.result]}
          onCheckAgain={() => onGoTo("preflight")}
          firstRun
          onContinue={() => onGoTo("empty-list")}
        />
      );
    case "empty":
      return (
        <AppShell
          tasks={[]}
          usage={usage}
          onOpenTask={() => {}}
          onNewTask={() => onGoTo("new-task")}
        >
          <EmptyTasks firstRun onNewTask={() => onGoTo("new-task")} />
        </AppShell>
      );
    case "newTask":
      return (
        <AppShell tasks={[]} usage={usage} onOpenTask={() => {}}>
          <NewTask
            key={`${view.draft}-${view.step}-${view.issues}`}
            repo="studio-web"
            branch="main"
            initial={drafts[view.draft]}
            read={read}
            providers={crew}
            paths={paths}
            onStart={() => onGoTo("setup")}
            {...(view.step ? { step: view.step } : {})}
            issues={issues}
            issuesOpen={view.issues === "open"}
            {...(view.issues === "picked" ? { pickedIssue: 128 } : {})}
          />
        </AppShell>
      );
    case "setup": {
      const asking = startedTask("asking");
      return (
        <AppShell tasks={[asking]} usage={usage} currentTaskId={asking.id} onOpenTask={() => {}}>
          <SetupConfirm
            repo={asking.repo}
            command="bun install"
            onAllow={() => onGoTo("preparing")}
            onDeny={() => {}}
            onEditGoal={() => onGoTo("bezl-read")}
          />
        </AppShell>
      );
    }
    case "started": {
      const started = startedTask("allowed");
      return (
        <AppShell tasks={[started]} usage={usage} currentTaskId={started.id} onOpenTask={() => {}}>
          <TaskPage
            task={started}
            stage={place?.stage ?? started.current}
            onStage={(stage) => onPlace({ taskId: started.id, stage })}
          />
        </AppShell>
      );
    }
    case "task":
      return (
        <TaskView
          place={place ?? view}
          kept={view.kept ?? false}
          shipped={view.shipped}
          side={view.side}
          full={view.full}
          interrupted={view.interrupted}
          shared={shared}
        />
      );
    case "approvals":
      return place ? (
        <TaskView place={place} kept={false} shared={shared} />
      ) : (
        <TasksShell list={tasks} current="approvals" shared={shared}>
          <Approvals
            items={shared.queue}
            onItems={onQueue}
            onOpenTask={(taskId, stage) => onPlace({ taskId, stage })}
          />
        </TasksShell>
      );
    case "history":
      return place ? (
        <TaskView place={place} kept shared={shared} />
      ) : (
        <TasksShell list={keptTasks} current={history.taskId} shared={shared}>
          <HistoryPage history={history} onBack={() => onGoTo("ship")} />
        </TasksShell>
      );
  }
}

/** Guided tour of Bezl on sample data; every screen stays clickable along the way. */
export function Walkthrough() {
  const [tour, setTour] = useState(() => parseTour(window.location.search));
  // A click inside the shell moves off the step's own place until the step changes.
  const [place, setPlace] = useState<Place | null>(null);
  const [queue, setQueue] = useState<NeedsYouItem[] | null>(null);
  useDocumentTheme(tour.theme);

  useEffect(() => {
    window.history.replaceState(null, "", tourSearch(tour));
  }, [tour]);

  const jump = useCallback((index: number) => {
    setPlace(null);
    setQueue(null);
    setTour((t) => ({ ...t, index }));
  }, []);

  const act = useCallback((action: TourAction) => {
    if (action.type === "theme") {
      setTour((t) => ({ ...t, theme: t.theme === "dark" ? "light" : "dark" }));
      return;
    }
    setPlace(null);
    setQueue(null);
    setTour((t) => step(t, action.by));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || ownsKeys(e.target)) return;
      const action = keyAction(e.key);
      if (!action) return;
      e.preventDefault();
      act(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act]);

  const current = steps[tour.index] ?? steps[0];
  return (
    <div className="walkthrough">
      <div className="walkthrough-view">
        {current ? (
          <View
            view={current.view}
            place={place}
            onPlace={setPlace}
            queue={queue}
            onQueue={setQueue}
            onGoTo={(id) =>
              jump(
                Math.max(
                  steps.findIndex((s) => s.id === id),
                  0,
                ),
              )
            }
          />
        ) : null}
      </div>
      <Dock tour={tour} act={act} jump={jump} />
    </div>
  );
}
