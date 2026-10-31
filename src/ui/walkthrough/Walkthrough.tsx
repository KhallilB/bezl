import { Button, Menu, Tooltip } from "@kb.ui/react";
import {
  type CSSProperties,
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { keptTasks, tasks, usage } from "../journey/fixtures";
import type { StageId } from "../journey/model";
import { TaskPage } from "../journey/TaskPage";
import { crew, drafts, paths, startedTask, suggestions } from "../newtask/fixtures";
import { NewTask } from "../newtask/NewTask";
import { SetupConfirm } from "../newtask/SetupConfirm";
import { ChooseRepository } from "../onboarding/ChooseRepository";
import { claudeFound, codexProbed, noWriter, thisMachine } from "../providers/fixtures";
import type { ProviderCheck } from "../providers/model";
import { Providers } from "../providers/Providers";
import { AppShell, EmptyTasks } from "../shell/AppShell";
import { task } from "../task/fixtures";
import type { WorkerView } from "../task/model";
import { Task } from "../task/Task";
import { usePortalRoot } from "../theme/AppTheme";
import { BackIcon, ContentsIcon, MoonIcon, NextIcon, SunIcon } from "./icons";
import {
  frameSrc,
  type Scene,
  sceneLabel,
  sceneNote,
  scenes,
  sceneWorkers,
  type Theme,
  themes,
} from "./states";
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

// Overview frames render the screen at a real window size, then scale to fit.
const FRAME = { width: 1280, height: 800 };

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
            w.id === id ? { ...w, state: "finished", summary: "Stopped by operator." } : w,
          ),
        )
      }
    />
  );
}

/** Scales a fixed-size frame to its cell's width. */
function useFitScale() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () =>
      el.style.setProperty("--walkthrough-scale", String(el.clientWidth / FRAME.width));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);
  return ref;
}

type OpenState = (scene: Scene, theme: Theme) => void;

function Cell({ scene, theme, onOpen }: { scene: Scene; theme: Theme; onOpen: OpenState }) {
  const frame = useFitScale();
  const name = `${sceneLabel[scene]}, ${theme}`;
  return (
    <li className="walkthrough-cell">
      <div
        ref={frame}
        className="walkthrough-frame"
        style={{ "--walkthrough-ratio": `${FRAME.width} / ${FRAME.height}` } as CSSProperties}
      >
        <iframe
          src={frameSrc(scene, theme)}
          title={`Task screen, ${name}`}
          width={FRAME.width}
          height={FRAME.height}
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
          inert
        />
      </div>
      <div className="walkthrough-caption">
        <span className="walkthrough-caption-name">{sceneLabel[scene]}</span>
        <span className="walkthrough-caption-note">{sceneNote[scene]}</span>
      </div>
      <button
        type="button"
        className="walkthrough-open"
        aria-label={`Open ${name}`}
        onClick={() => onOpen(scene, theme)}
      />
    </li>
  );
}

function Overview({ onOpen }: { onOpen: OpenState }) {
  return (
    <main className="walkthrough-overview" aria-labelledby="walkthrough-overview-title">
      <header className="walkthrough-intro">
        <h1 id="walkthrough-overview-title">Every state, both themes</h1>
        <p>The interim Task screen on sample data. Click a screen to open it.</p>
      </header>
      {themes.map((theme) => (
        <section key={theme} className="walkthrough-row" aria-labelledby={`walkthrough-${theme}`}>
          <h2 id={`walkthrough-${theme}`}>{theme === "dark" ? "Dark" : "Light"}</h2>
          <ul className="walkthrough-grid">
            {scenes.map((scene) => (
              <Cell key={scene} scene={scene} theme={theme} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ))}
    </main>
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

type TaskViewProps = {
  place: Place;
  kept: boolean;
  onPlace: (place: Place) => void;
  onKeep: () => void;
};

function TaskView({ place, kept, onPlace, onKeep }: TaskViewProps) {
  const list = kept ? keptTasks : tasks;
  const open = list.find((t) => t.id === place.taskId) ?? list[0];
  if (!open) return null;
  return (
    <AppShell
      tasks={list}
      usage={usage}
      currentTaskId={open.id}
      onOpenTask={(taskId) => {
        const next = list.find((t) => t.id === taskId);
        if (next) onPlace({ taskId, stage: next.current });
      }}
    >
      <TaskPage
        task={open}
        stage={place.stage}
        onStage={(stage) => onPlace({ ...place, stage })}
        onKeep={onKeep}
      />
    </AppShell>
  );
}

const preflight: Record<Exclude<Preflight, "checking">, ProviderCheck[]> = {
  ready: [claudeFound, codexProbed],
  impostor: thisMachine,
  noWriter,
};

function View({
  view,
  place,
  onPlace,
  onOpen,
  onGoTo,
}: {
  view: TourView;
  place: Place | null;
  onPlace: (place: Place) => void;
  onOpen: OpenState;
  /** Moves the tour to a step by id, as a click in a screen would. */
  onGoTo: (id: string) => void;
}) {
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
        <Providers checks={null} checking />
      ) : (
        <Providers checks={preflight[view.result]} onCheckAgain={() => onGoTo("preflight")} />
      );
    case "empty":
      return (
        <AppShell
          tasks={[]}
          usage={usage}
          onOpenTask={() => {}}
          onNewTask={() => onGoTo("new-task")}
        >
          <EmptyTasks onNewTask={() => onGoTo("new-task")} />
        </AppShell>
      );
    case "newTask":
      return (
        <AppShell tasks={[]} usage={usage} onOpenTask={() => {}}>
          <NewTask
            key={`${view.draft}-${view.focus}`}
            repo="studio-web"
            branch="main"
            initial={drafts[view.draft]}
            suggestions={suggestions}
            providers={crew}
            paths={paths}
            onStart={() => onGoTo("setup")}
            {...(view.focus ? { focus: view.focus } : {})}
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
          onPlace={onPlace}
          onKeep={() => onGoTo("ship")}
        />
      );
    case "state":
      return <StateScene key={view.scene} scene={view.scene} />;
    case "overview":
      return <Overview onOpen={onOpen} />;
  }
}

/** Guided tour of Bezl on sample data; every screen stays clickable along the way. */
export function Walkthrough() {
  const [tour, setTour] = useState(() => parseTour(window.location.search));
  // A click inside the shell moves off the step's own place until the step changes.
  const [place, setPlace] = useState<Place | null>(null);
  useDocumentTheme(tour.theme);

  useEffect(() => {
    window.history.replaceState(null, "", tourSearch(tour));
  }, [tour]);

  const jump = useCallback((index: number) => {
    setPlace(null);
    setTour((t) => ({ ...t, index }));
  }, []);

  const act = useCallback((action: TourAction) => {
    if (action.type === "theme") {
      setTour((t) => ({ ...t, theme: t.theme === "dark" ? "light" : "dark" }));
      return;
    }
    setPlace(null);
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

  const openState: OpenState = (scene, theme) => {
    const index = steps.findIndex((s) => s.view.kind === "state" && s.view.scene === scene);
    setPlace(null);
    setTour({ index: Math.max(index, 0), theme });
  };

  const current = steps[tour.index] ?? steps[0];
  return (
    <div className="walkthrough">
      <div className="walkthrough-view">
        {current ? (
          <View
            view={current.view}
            place={place}
            onPlace={setPlace}
            onOpen={openState}
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
