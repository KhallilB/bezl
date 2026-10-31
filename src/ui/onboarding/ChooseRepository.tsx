import { Button, Callout } from "@kb.ui/react";
import "../shell/page.css";
import "./onboarding.css";

export type Refusal = { path: string; reason: string };

export type ChooseRepositoryProps = {
  /** Opens the folder picker; the app checks the choice and may refuse it. */
  onChoose: () => void;
  refused?: Refusal;
};

/** First run: Bezl needs a git repository before anything else. */
export function ChooseRepository({ onChoose, refused }: ChooseRepositoryProps) {
  return (
    <main className="onboarding" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <span className="onboarding-brand">
          <span className="onboarding-mark" aria-hidden="true" />
          Bezl
        </span>
        <header className="page-header">
          <h1 id="onboarding-title" className="page-title">
            Open a repository
          </h1>
          <p className="page-lead">
            Bezl works inside a git repository. Every task's record stays in its{" "}
            <code>.git/bezl</code> folder, on this machine.
          </p>
        </header>
        {refused ? (
          <Callout tone="warning" role="alert" title={refused.reason}>
            <code>{refused.path}</code> has no git history. Choose the folder you cloned.
          </Callout>
        ) : null}
        <Button variant="secondary" onClick={onChoose}>
          Choose a folder
        </Button>
      </div>
    </main>
  );
}
