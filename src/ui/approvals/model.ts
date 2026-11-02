import type { Assumption, JourneyTask, StageId } from "../journey/model";

// Needs-you items: everything that waits on you, in one queue (J4).

export type NeedsYouKind = "question" | "access" | "dispute";

export const kindLabel: Record<NeedsYouKind, string> = {
  question: "Question",
  access: "More access",
  dispute: "Disputed issue",
};

/** `next` says what happens once you choose it; `example` names a Shot that shows it. */
export type NeedsYouChoice = { id: string; label: string; next: string; example?: string };

export type NeedsYouItem = {
  id: string;
  taskId: string;
  taskTitle: string;
  /** Where it came up; it shows inline there too. */
  stage: StageId;
  kind: NeedsYouKind;
  from: string;
  prompt: string;
  /** The file, command or finding it is about. */
  context?: string;
  /** What waits on the answer. */
  blocks?: string;
  /** The choice id Bezl would pick; you still decide. */
  recommended?: string;
  waited: string;
  choices: NeedsYouChoice[];
};

export type Answered = { taskTitle: string; label: string; next: string };

export function itemsFor(items: NeedsYouItem[], taskId: string, stage: StageId): NeedsYouItem[] {
  return items.filter((i) => i.taskId === taskId && i.stage === stage);
}

/** Answering takes the item off the queue; the record keeps the answer. */
export function answer(
  items: NeedsYouItem[],
  itemId: string,
  choiceId: string,
): { items: NeedsYouItem[]; answered: Answered } | null {
  const item = items.find((i) => i.id === itemId);
  const choice = item?.choices.find((c) => c.id === choiceId);
  if (!item || !choice) return null;
  return {
    items: items.filter((i) => i !== item),
    answered: { taskTitle: item.taskTitle, label: choice.label, next: choice.next },
  };
}

/** Changing an assumption turns it into a question in the stage you're on. */
export function raise(
  task: Pick<JourneyTask, "id" | "title">,
  stage: StageId,
  { id, question }: Assumption,
): NeedsYouItem {
  return {
    id: `${task.id}-${id}`,
    taskId: task.id,
    taskTitle: task.title,
    stage,
    kind: "question",
    from: "you",
    ...question,
    waited: "just now",
  };
}
