// A new task's brief and crew; M5 turns a started draft into the task's first events.

export type Checker = "bezl" | "you";
export type DoneWhen = { text: string; checker: Checker };

export type BriefDraft = {
  /** The operator's own words. */
  text: string;
  who?: string;
  doneWhen: DoneWhen[];
  avoid?: string;
  example?: string;
};

export type CheckId = "what" | "who" | "done" | "avoid" | "example";
export type ReadinessCheck = { id: CheckId; label: string; why: string; met: boolean };

const filled = (value: string | undefined) => (value?.trim().length ?? 0) > 0;
// Five words reads as a sentence of intent, not a title.
const intent = (text: string) => text.trim().split(/\s+/).filter(Boolean).length >= 5;

/** The five things a brief is checked against as it is typed; none blocks starting. */
export function readiness(draft: BriefDraft): ReadinessCheck[] {
  return [
    {
      id: "what",
      label: "What you want",
      why: "A sentence of intent, not a title, so the model builds the right thing.",
      met: intent(draft.text),
    },
    {
      id: "who",
      label: "Who it is for",
      why: "Tells the model whose problem it solves when choices come up.",
      met: filled(draft.who),
    },
    {
      id: "done",
      label: "How you will know it is done",
      why: "Bezl checks these after every step instead of taking the model's word.",
      met: draft.doneWhen.length > 0,
    },
    {
      id: "avoid",
      label: "What to avoid or reuse",
      why: "Keeps the change small and inside the code you already have.",
      met: filled(draft.avoid),
    },
    {
      id: "example",
      label: "An example to follow",
      why: "One existing screen or file is worth a paragraph of description.",
      met: filled(draft.example),
    },
  ];
}

export type Suggestion = Partial<Omit<BriefDraft, "text">>;

/** One-click addition: fills what the suggestion names; done-when items append. */
export function suggest(draft: BriefDraft, addition: Suggestion): BriefDraft {
  return {
    ...draft,
    ...addition,
    doneWhen: [...draft.doneWhen, ...(addition.doneWhen ?? [])],
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
      : { id: p.id, label: p.name, disabled: "Not an agent CLI, so it has no tools to write with" },
  );
}

/** A reviewer must be proven read-only; the writer's own vendor is allowed but labelled. */
export function reviewerChoices(providers: CrewProvider[], writerId: string): Choice[] {
  const vendor = providers.find((p) => p.id === writerId)?.vendor;
  return providers.map((p): Choice => {
    if (!p.readOnly) return { id: p.id, label: p.name, disabled: "Not proven read-only" };
    return p.vendor === vendor
      ? { id: p.id, label: p.name, note: "Reviewed by the same provider that wrote it" }
      : { id: p.id, label: p.name };
  });
}
