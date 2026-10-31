import { Button } from "@kb.ui/react";
import { LightIcon } from "../journey/icons";
import "./newtask.css";

export type SetupConfirmProps = {
  repo: string;
  command: string;
  /** `remember` skips the question for this command in this repository from now on. */
  onAllow: (remember: boolean) => void;
  onDeny: () => void;
};

/** A setup command is a needs-you item: Bezl runs nothing in your repository unasked. */
export function SetupConfirm({ repo, command, onAllow, onDeny }: SetupConfirmProps) {
  return (
    <section className="newtask-setup page" aria-labelledby="newtask-setup-title">
      <header className="page-header">
        <div className="page-title-row">
          <h1 id="newtask-setup-title" className="page-title">
            Run setup in the new worktree?
          </h1>
          <span className="page-tag">{repo}</span>
        </div>
        <p className="page-status newtask-setup-status">
          <span className="newtask-setup-icon">
            <LightIcon light="needsYou" />
          </span>
          <span>
            <strong>Needs you.</strong> The worktree needs its dependencies before anyone can plan
            or build. This command runs there, never in your checkout.
          </span>
        </p>
      </header>
      <pre className="newtask-command">
        <code>{command}</code>
      </pre>
      <div className="newtask-actions">
        <Button variant="secondary" onClick={() => onAllow(false)}>
          Allow
        </Button>
        <Button variant="ghost" onClick={() => onAllow(true)}>
          Allow and don't ask again
        </Button>
        <Button variant="ghost" onClick={onDeny}>
          Deny
        </Button>
      </div>
    </section>
  );
}
