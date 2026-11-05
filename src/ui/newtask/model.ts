// A new task's goal and crew, which the writer gets as its brief; M5 turns a started draft into events.

export type Checker = "bezl" | "you";
export type DoneWhen = { text: string; checker: Checker };

export type BriefDraft = {
  /** The operator's own words. */
  text: string;
  who?: string;
  doneWhen: DoneWhen[];
  avoid?: string;
  example?: string;
  /** The issue it was filled from, linked from the task. */
  issue?: { number: number; url: string };
};

export type GitHubIssue = {
  number: number;
  title: string;
  body: string;
  url: string;
  labels?: string[];
};

export type CheckId = "what" | "who" | "done" | "avoid" | "example";
export type ReadinessCheck = { id: CheckId; label: string; why: string; met: boolean };

const filled = (value: string | undefined) => (value?.trim().length ?? 0) > 0;
// Five words reads as a sentence of intent, not a title.
const intent = (text: string) => text.trim().split(/\s+/).filter(Boolean).length >= 5;

/** The five things a goal is checked against as it is typed; none blocks starting. */
export function readiness(draft: BriefDraft): ReadinessCheck[] {
  return [
    {
      id: "what",
      label: "What you want",
      why: "Write a sentence, not a title, so the agent builds the right thing.",
      met: intent(draft.text),
    },
    {
      id: "who",
      label: "Who it's for",
      why: "When the agent has to make a judgement call, knowing whose problem it's solving helps it choose well.",
      met: filled(draft.who),
    },
    {
      id: "done",
      label: "How you'll know it's done",
      why: "Bezl checks these after every step, so you don't have to take the agent's word that it's finished.",
      met: draft.doneWhen.length > 0,
    },
    {
      id: "avoid",
      label: "What to avoid or reuse",
      why: "This keeps the change small and builds on the code you already have.",
      met: filled(draft.avoid),
    },
    {
      id: "example",
      label: "An example to follow",
      why: "Pointing to one existing screen or file says more than a paragraph of description.",
      met: filled(draft.example),
    },
  ];
}

/** One thing Bezl took from the goal and the code; `from` says where, so you can judge it. */
export type Read = { text: string; from: string };

export type BezlRead = {
  who?: Read;
  avoid?: Read;
  example?: Read;
  done?: { lines: DoneWhen[]; from: string };
  /** The files the attempt may change. */
  files?: { paths: string[]; from: string };
};

/** Fills what you left empty and adds lines you don't have; never overwrites yours. */
export function applyRead(draft: BriefDraft, read: BezlRead): BriefDraft {
  const fill = (mine: string | undefined, theirs: Read | undefined) =>
    mine?.trim() ? mine : theirs?.text;
  const lines = (read.done?.lines ?? []).filter(
    (l) => !draft.doneWhen.some((d) => d.text === l.text),
  );
  const parts = {
    who: fill(draft.who, read.who),
    avoid: fill(draft.avoid, read.avoid),
    example: fill(draft.example, read.example),
  };
  return {
    ...draft,
    ...Object.fromEntries(Object.entries(parts).filter(([, v]) => v !== undefined)),
    doneWhen: [...draft.doneWhen, ...lines],
  };
}

export type CrewProvider = {
  id: string;
  name: string;
  /** The model's vendor, not the CLI's: it decides self-review. */
  vendor: string;
  canWrite: boolean;
  readOnly: boolean;
};

export type Choice = { id: string; label: string; disabled?: string; note?: string };

/** Only an agent CLI has the tools to write. */
export function writerChoices(providers: CrewProvider[]): Choice[] {
  return providers.map((p) =>
    p.canWrite
      ? { id: p.id, label: p.name }
      : { id: p.id, label: p.name, disabled: "Not a coding agent, so it can't write code" },
  );
}

/** A reviewer must be proven read-only; the writer's own vendor is allowed but labelled. */
export function reviewerChoices(providers: CrewProvider[], writerId: string): Choice[] {
  const vendor = providers.find((p) => p.id === writerId)?.vendor;
  return providers.map((p): Choice => {
    if (!p.readOnly)
      return { id: p.id, label: p.name, disabled: "It might change files, so it can't review" };
    return p.vendor === vendor
      ? { id: p.id, label: p.name, note: "The writer and reviewer come from the same company" }
      : { id: p.id, label: p.name };
  });
}

const checklistItem = /^\s*[-*] \[[ xX]\] (.+)$/;

/** Issue prose fills the goal; its checklist becomes done checks only you can judge. */
export function briefFromIssue({ number, title, body, url }: GitHubIssue): BriefDraft {
  const lines = body.split(/\r?\n/);
  const doneWhen = lines.flatMap((l) => {
    const item = checklistItem.exec(l)?.[1]?.trim();
    return item ? [{ text: item, checker: "you" as const }] : [];
  });
  const prose = lines
    .filter((l) => !checklistItem.test(l))
    .join("\n")
    .trim();
  return { text: prose ? `${title}\n\n${prose}` : title, doneWhen, issue: { number, url } };
}

/** Drops what an issue filled in: its goal, its link and its checklist lines. */
export function withoutIssue(draft: BriefDraft, issue: GitHubIssue | undefined): BriefDraft {
  const from = issue ? briefFromIssue(issue).doneWhen.map((d) => d.text) : [];
  const { issue: _, ...rest } = draft;
  return { ...rest, text: "", doneWhen: draft.doneWhen.filter((d) => !from.includes(d.text)) };
}

/** An issue fills the goal and adds its lines; what you wrote yourself stays. */
export function withIssue(
  draft: BriefDraft,
  issue: GitHubIssue,
  before: GitHubIssue | undefined,
): BriefDraft {
  const kept = withoutIssue(draft, before);
  const from = briefFromIssue(issue);
  const lines = from.doneWhen.filter((d) => !kept.doneWhen.some((k) => k.text === d.text));
  return {
    ...kept,
    text: from.text,
    doneWhen: [...lines, ...kept.doneWhen],
    ...(from.issue ? { issue: from.issue } : {}),
  };
}
