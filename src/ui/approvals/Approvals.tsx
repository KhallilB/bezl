import { Button } from "@kb.ui/react";
import { useId, useState } from "react";
import { LightIcon } from "../journey/icons";
import type { StageId } from "../journey/model";
import { type Answered, answer, kindLabel, type NeedsYouItem } from "./model";
import "./approvals.css";

type ListProps = {
  items: NeedsYouItem[];
  onItems: (items: NeedsYouItem[]) => void;
  /** Approvals names each item's task as a link; inline, the task is already open. */
  onOpenTask?: ((taskId: string, stage: StageId) => void) | undefined;
};

function Item({
  item,
  onAnswer,
  onOpenTask,
}: {
  item: NeedsYouItem;
  onAnswer: (choiceId: string) => void;
  onOpenTask: ListProps["onOpenTask"];
}) {
  const id = useId();
  return (
    <article className="needsyou-item" aria-labelledby={id}>
      <header className="needsyou-head">
        <span className="needsyou-icon">
          <LightIcon light="needsYou" />
        </span>
        <span id={id} className="needsyou-kind">{`${kindLabel[item.kind]} from ${item.from}`}</span>
        <span className="needsyou-waited">{`waiting ${item.waited}`}</span>
      </header>
      {onOpenTask ? (
        <a
          href={`#${item.taskId}`}
          className="needsyou-task"
          onClick={(e) => {
            e.preventDefault();
            onOpenTask(item.taskId, item.stage);
          }}
        >
          {item.taskTitle}
        </a>
      ) : null}
      <p className="needsyou-prompt">{item.prompt}</p>
      {item.context ? <p className="needsyou-context">{item.context}</p> : null}
      <div className="needsyou-choices">
        {item.choices.map((c, i) => (
          <Button
            key={c.id}
            size="sm"
            variant={i === 0 ? "secondary" : "ghost"}
            onClick={() => onAnswer(c.id)}
          >
            {c.label}
          </Button>
        ))}
      </div>
    </article>
  );
}

/** The items with their choices; the last answer says what happens next. */
export function NeedsYouList({ items, onItems, onOpenTask }: ListProps) {
  const [last, setLast] = useState<Answered | null>(null);
  return (
    <div className="needsyou">
      {items.map((item) => (
        <Item
          key={item.id}
          item={item}
          onOpenTask={onOpenTask}
          onAnswer={(choiceId) => {
            const result = answer(items, item.id, choiceId);
            if (!result) return;
            setLast(result.answered);
            onItems(result.items);
          }}
        />
      ))}
      <p className="needsyou-answered" role="status">
        {last ? `Answered “${last.label}” on ${last.taskTitle}. ${last.next}` : null}
      </p>
    </div>
  );
}

const count = (n: number) => (n === 1 ? "1 thing needs you." : `${n} things need you.`);

/** Approvals: one queue for every task, oldest question first. */
export function Approvals({
  items,
  onItems,
  onOpenTask,
}: Required<Pick<ListProps, "onOpenTask">> & Omit<ListProps, "onOpenTask">) {
  return (
    <section className="page" aria-labelledby="approvals-title">
      <header className="page-header">
        <h1 id="approvals-title" className="page-title">
          {items.length === 0 ? "Nothing needs you" : "Approvals"}
        </h1>
        <p className="page-status">
          {items.length === 0 ? "Answers are kept in each task's history." : count(items.length)}
        </p>
      </header>
      <NeedsYouList items={items} onItems={onItems} onOpenTask={onOpenTask} />
    </section>
  );
}
