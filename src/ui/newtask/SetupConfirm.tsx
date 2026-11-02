import { Button } from "@kb.ui/react";
import { useState } from "react";
import { LightIcon } from "../journey/icons";
import "./newtask.css";

export type SetupConfirmProps = {
  repo: string;
  command: string;
  /** `remember` skips the question for this command in this repository from now on. */
  onAllow: (remember: boolean) => void;
  onDeny: () => void;
  /** Offered once setup is denied, to change what the task asks for. */
  onEditBrief?: () => void;
};

/** A setup command is a needs-you item: Bezl runs nothing in your repository unasked. */
export function SetupConfirm({ repo, command, onAllow, onDeny, onEditBrief }: SetupConfirmProps) {
  const [denied, setDenied] = useState(false);
  return (
    <section className="newtask-setup page" aria-labelledby="newtask-setup-title">
      <header className="page-header">
        <div className="page-title-row">
          <h1 id="newtask-setup-title" className="page-title">
            {denied ? "Setup denied" : "Run setup in the task's copy of your code?"}
          </h1>
          <span className="page-tag">{repo}</span>
        </div>
        <p className="page-status newtask-setup-status" data-state={denied ? "denied" : undefined}>
          <span className="newtask-setup-icon">
            <LightIcon light={denied ? "waiting" : "needsYou"} />
          </span>
          {denied ? (
            <span>
              <strong>Stopped.</strong> Nothing ran in the task's copy of your code. You can allow
              setup to carry on, or change the brief instead.
            </span>
          ) : (
            <span>
              <strong>Needs you.</strong> Before work can start, the task's copy of your code needs
              its dependencies installed. This command runs only in that copy and never touches
              yours.
            </span>
          )}
        </p>
      </header>
      <pre className="newtask-command">
        <code>{command}</code>
      </pre>
      <div className="newtask-actions">
        {denied ? (
          <>
            <Button variant="secondary" onClick={() => onAllow(false)}>
              Allow setup
            </Button>
            {onEditBrief ? (
              <Button variant="ghost" onClick={onEditBrief}>
                Edit the brief
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onAllow(false)}>
              Allow
            </Button>
            <Button variant="ghost" onClick={() => onAllow(true)}>
              Allow and don't ask again
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDenied(true);
                onDeny();
              }}
            >
              Deny
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
