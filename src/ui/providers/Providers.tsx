import { Badge, Button, Callout, Code, Inline, Panel, Status, Text } from "@kb.ui/react";
import type { ReactNode } from "react";
import "../shell/page.css";
import { StateIcon } from "../task/icons";
import {
  agentSummary,
  canaryShown,
  capabilityRows,
  type Fix,
  fixes,
  type GitHubCheck,
  githubChecking,
  githubFixes,
  githubNote,
  githubShown,
  homeName,
  limitHit,
  type ProviderCheck,
  providerName,
  readOnlyShown,
  readyShown,
  rejectionText,
  type Shown,
  signinShown,
  tierRows,
  tiersShown,
  tokensText,
  unknownText,
  windowText,
} from "./model";
import "./providers.css";

export type ProvidersProps = {
  /** `null` until the first preflight returns. */
  checks: ProviderCheck[] | null;
  /** A rerun in flight; the last results stay on screen. */
  checking?: boolean;
  error?: string;
  onCheckAgain?: () => void;
  /** The way back to your tasks; never blocked, since Start is where a writer is needed. */
  onContinue?: () => void;
  /** Omitted: no GitHub row. `null`: its check is in flight. */
  github?: GitHubCheck | null;
};

/** Backticks mark code, as in the model's fix text. */
function Coded({ text }: { text: string }) {
  return text
    .split(/(`[^`]*`)/)
    .map((part) =>
      part.startsWith("`") ? <Code key={part}>{part.slice(1, -1)}</Code> : part || null,
    );
}

function Shows({ shown }: { shown: Shown }) {
  return (
    <Status appearance="chip" compact tone={shown.tone} icon={<StateIcon state={shown.icon} />}>
      {shown.label}
    </Status>
  );
}

function Labelled({ label, shown }: { label: string; shown: Shown }) {
  return (
    <Inline gap="sm" justify="between">
      <Text as="span" size="sm" tone="muted">
        {label}
      </Text>
      <Shows shown={shown} />
    </Inline>
  );
}

function SignIn({ check }: { check: ProviderCheck }) {
  const { signin } = check;
  if (signin.kind === "noBinary") return null;
  return (
    <ul className="providers-list" aria-label="Sign-in">
      {signin.kind === "canary" ? (
        <li>
          <Labelled label="Sign-in" shown={canaryShown(signin.detail)} />
        </li>
      ) : (
        signin.detail.map((h) => (
          <li key={h.home} className="providers-home">
            <Labelled label={homeName[h.home]} shown={signinShown(h.signin)} />
            <div>
              <Code>{h.path}</Code>
            </div>
          </li>
        ))
      )}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Inline gap="sm" justify="between">
      <Text as="span" size="sm" tone="muted">
        {label}
      </Text>
      <Text as="span" size="sm" {...(value === unknownText ? { tone: "muted" } : {})}>
        {value}
      </Text>
    </Inline>
  );
}

function UsageList({ check }: { check: ProviderCheck }) {
  const { signin, usage } = check;
  if (signin.kind === "noBinary") return null;
  const { limits } = usage;
  return (
    <ul className="providers-list" aria-label="Usage">
      <li>
        <Row
          label={signin.kind === "canary" ? "Test message tokens" : "Tokens"}
          value={tokensText(usage.tokens)}
        />
      </li>
      <li className="providers-home">
        {limits.kind === "unknown" ? (
          <Row label="Limits" value={unknownText} />
        ) : (
          <>
            <Text as="span" size="sm" tone="muted">
              Limits
            </Text>
            {limits.detail.windows.length > 0 ? (
              <ul className="providers-windows" aria-label="Usage limits">
                {limits.detail.windows.map((w) => (
                  <li key={w.name}>
                    <Text as="span" size="sm">
                      {windowText(w)}
                    </Text>
                  </li>
                ))}
              </ul>
            ) : null}
            {limits.detail.hit !== null ? (
              <>
                <div>
                  <Shows shown={limitHit} />
                </div>
                <Text size="sm" tone="muted">
                  {`${providerName[check.discovery.provider]} said "${limits.detail.hit}"`}
                </Text>
              </>
            ) : null}
          </>
        )}
      </li>
    </ul>
  );
}

function ReadOnly({ check }: { check: ProviderCheck }) {
  const overall = readOnlyShown(check);
  if (overall === null) return null;
  return (
    <section className="providers-section">
      <Inline gap="sm" justify="between">
        <h3 className="page-label">Can it change files?</h3>
        <Shows shown={overall.shown} />
      </Inline>
      {overall.detail ? (
        <Text size="sm" tone="muted">
          {overall.detail}
        </Text>
      ) : null}
      <ul className="providers-list" aria-label="Safety tests">
        {capabilityRows(check).map((row) => (
          <li key={row.capability} className="providers-home">
            <Inline gap="sm" justify="between">
              <Text as="span" size="sm">
                {row.label}
              </Text>
              {row.outcome ? <Shows shown={row.outcome} /> : null}
            </Inline>
            <Text as="span" size="sm" tone="muted" className="providers-code">
              <Coded text={row.enforcement} />
            </Text>
            {row.note ? (
              <Text as="span" size="sm">
                {row.note}
              </Text>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tiers({ check }: { check: ProviderCheck }) {
  const overall = tiersShown(check);
  if (overall === null) return null;
  const rows = tierRows(check);
  return (
    <section className="providers-section">
      <Inline gap="sm" justify="between">
        <h3 className="page-label">Working alongside other tasks</h3>
        <Shows shown={overall.shown} />
      </Inline>
      <Text size="sm" tone="muted">
        {[overall.detail, "Bezl doesn't use this yet."].filter(Boolean).join(". ")}
      </Text>
      {rows.length > 0 ? (
        <ul className="providers-list" aria-label="What works alongside other tasks">
          {rows.map((row) => (
            <li key={row.tier} className="providers-home">
              <Inline gap="sm" justify="between">
                <Text as="span" size="sm">
                  {row.label}
                </Text>
                <Shows shown={row.outcome} />
              </Inline>
              <Text as="span" size="sm" tone="muted">
                {row.note}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Fixes({ list }: { list: Fix[] }) {
  if (list.length === 0) return null;
  return (
    <section className="providers-section">
      <h3 className="page-label">To fix</h3>
      <ul className="providers-list" aria-label="To fix">
        {list.map((f) => (
          <li key={f.problem} className="providers-home">
            <Text as="span" size="sm" className="providers-problem">
              <Coded text={f.problem} />
            </Text>
            {f.says ? (
              <Text as="span" size="sm" tone="muted">
                {f.says}
              </Text>
            ) : null}
            <Text as="span" size="sm" className="providers-code">
              <Coded text={f.action} />
            </Text>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A verdict and one line up top; fixes stay in view, the rest folds into Details. */
function AgentRow({
  id,
  name,
  shown,
  reason,
  fix,
  children,
}: {
  id: string;
  name: string;
  shown: Shown;
  reason: string;
  fix: Fix[];
  children: ReactNode;
}) {
  return (
    <Panel className="providers-panel" aria-labelledby={id}>
      <Panel.Header>
        <h2 id={id} className="providers-title">
          {name}
        </h2>
        <Shows shown={shown} />
      </Panel.Header>
      <Panel.Body className="providers-body">
        {/* A ready row's badge says it all; the reason shows only when something is off. */}
        {shown.tone === "success" ? null : (
          <Text size="sm" tone="muted">
            {reason}
          </Text>
        )}
        <Fixes list={fix} />
        <details className="providers-details">
          <summary>Details</summary>
          <div className="providers-body">{children}</div>
        </details>
      </Panel.Body>
    </Panel>
  );
}

function Where({
  path,
  version,
  pinned = true,
}: {
  path: string;
  version: string;
  pinned?: boolean;
}) {
  return (
    <Inline gap="sm">
      <Code>{path}</Code>
      <Badge mono preserveCase>
        {version}
      </Badge>
      {pinned ? null : <Badge tone="warning">Untested version</Badge>}
    </Inline>
  );
}

function ProviderPanel({ check }: { check: ProviderCheck }) {
  const { provider, found: bin, rejected } = check.discovery;
  return (
    <AgentRow
      id={`provider-${provider}-title`}
      name={providerName[provider]}
      {...agentSummary(check)}
      fix={fixes(check)}
    >
      {bin ? <Where path={bin.path} version={bin.version} pinned={check.pinned} /> : null}
      <SignIn check={check} />
      <ReadOnly check={check} />
      <Tiers check={check} />
      <UsageList check={check} />
      {rejected.length > 0 ? (
        <section>
          <h3 className="page-label">Rejected</h3>
          <ul className="providers-list" aria-label="Rejected binaries">
            {rejected.map((r) => (
              <li key={r.path}>
                <Inline gap="sm">
                  <Code>{r.path}</Code>
                  <Text as="span" size="sm">
                    {rejectionText(r.reason)}
                  </Text>
                </Inline>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AgentRow>
  );
}

function GitHubPanel({ check }: { check: GitHubCheck | null }) {
  const gh = check?.kind === "found" ? check.detail : null;
  return (
    <AgentRow
      id="github-title"
      name="GitHub"
      shown={check ? githubShown(check) : githubChecking}
      reason={githubNote}
      fix={check ? githubFixes(check) : []}
    >
      {gh ? <Where path={gh.path} version={gh.version} /> : null}
      <Text size="sm" tone="muted">
        {githubNote}
      </Text>
    </AgentRow>
  );
}

/** One line: who can write, or that no one can yet. */
function Writers({ checks }: { checks: ProviderCheck[] }) {
  const ready = readyShown(checks);
  return ready ? (
    <Shows shown={ready} />
  ) : (
    <Callout tone="warning" title="No coding agent can write code yet" />
  );
}

/** A card per agent while its check runs, so the page has its shape from the start. */
function Checking() {
  return (
    <div className="providers-grid">
      {Object.values(providerName).map((name) => (
        <Panel key={name} className="providers-panel" aria-label={name}>
          <Panel.Header>
            <h2 className="providers-title">{name}</h2>
            <Shows shown={githubChecking} />
          </Panel.Header>
        </Panel>
      ))}
    </div>
  );
}

export function Providers({
  checks,
  checking = false,
  error,
  onCheckAgain,
  onContinue,
  github,
}: ProvidersProps) {
  const busy = checking || (checks === null && !error);
  return (
    <div className="providers-screen">
      <div className="page providers-page">
        <header className="page-header">
          <div className="page-title-row">
            <h1 className="page-title">Coding agents</h1>
            {onCheckAgain ? (
              <span className="page-action">
                <Button variant="secondary" size="sm" disabled={busy} onClick={onCheckAgain}>
                  Check again
                </Button>
              </span>
            ) : null}
          </div>
        </header>
        {busy ? (
          <p role="status" className="kb-sr-only">
            Checking your coding agents…
          </p>
        ) : null}
        {error ? (
          <Callout tone="danger" role="alert" title="Agent check failed">
            {error}
          </Callout>
        ) : null}
        {checks || onContinue ? (
          <div className="providers-ready">
            {checks ? <Writers checks={checks} /> : <span />}
            {onContinue ? (
              <Button variant="secondary" onClick={onContinue}>
                Back to tasks
              </Button>
            ) : null}
          </div>
        ) : null}
        {/* Above the CLI cards, which run long: a missing sign-in should show on day one. */}
        {github === undefined ? null : <GitHubPanel check={github} />}
        {checks === null ? (
          error ? null : (
            <Checking />
          )
        ) : (
          <div className="providers-grid">
            {checks.map((c) => (
              <ProviderPanel key={c.discovery.provider} check={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
