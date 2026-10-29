import { Badge, Callout, Code, Panel, Status } from "@kb.ui/react";
import { StateIcon } from "../task/icons";
import {
  found,
  homeName,
  notCheckedYet,
  notFound,
  type ProviderCheck,
  providerName,
  rejectionText,
  type Shown,
  signinShown,
} from "./model";
import "./providers.css";

export type ProvidersProps = {
  /** `null` while preflight runs. */
  checks: ProviderCheck[] | null;
  error?: string;
};

function Shows({ shown }: { shown: Shown }) {
  return (
    <Status appearance="chip" compact tone={shown.tone} icon={<StateIcon state={shown.icon} />}>
      {shown.label}
    </Status>
  );
}

function SignIn({ check }: { check: ProviderCheck }) {
  const { signin } = check;
  if (signin.kind === "noBinary") return null;
  return (
    <ul className="providers-rows" aria-label="Sign-in">
      {signin.kind === "notCheckedYet" ? (
        <li className="providers-home">
          <span className="providers-label">Sign-in</span>
          <Shows shown={notCheckedYet} />
        </li>
      ) : (
        signin.detail.map((h) => (
          <li key={h.home} className="providers-home">
            <span className="providers-label">{homeName[h.home]}</span>
            <Shows shown={signinShown(h.signin)} />
            <Code className="providers-path">{h.path}</Code>
          </li>
        ))
      )}
    </ul>
  );
}

function ProviderPanel({ check }: { check: ProviderCheck }) {
  const { provider, found: bin, rejected } = check.discovery;
  const headingId = `provider-${provider}-title`;
  return (
    <Panel className="providers-panel" aria-labelledby={headingId}>
      <Panel.Header>
        <h2 id={headingId}>{providerName[provider]}</h2>
        <Shows shown={bin ? found : notFound} />
      </Panel.Header>
      <Panel.Body className="providers-body">
        {bin ? (
          <div className="providers-row">
            <Code className="providers-path">{bin.path}</Code>
            <Badge mono preserveCase>
              {bin.version}
            </Badge>
          </div>
        ) : (
          <p className="providers-line">{`No ${providerName[provider]} on PATH.`}</p>
        )}
        <SignIn check={check} />
        {rejected.length > 0 ? (
          <section className="providers-rejected">
            <h3>Rejected</h3>
            <ul className="providers-rows" aria-label="Rejected binaries">
              {rejected.map((r) => (
                <li key={r.path} className="providers-row">
                  <Code className="providers-path">{r.path}</Code>
                  <span className="providers-says">{rejectionText(r.reason)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Panel.Body>
    </Panel>
  );
}

export function Providers({ checks, error }: ProvidersProps) {
  return (
    <div className="providers-screen">
      <header className="providers-header">
        <h1>Providers</h1>
        <p className="providers-line">Agent CLIs on PATH, identified by their version output.</p>
      </header>
      {error ? (
        <Callout tone="danger" role="alert" title="Preflight failed">
          {error}
        </Callout>
      ) : checks === null ? (
        <p className="providers-line">Checking agent CLIs…</p>
      ) : (
        <main className="providers-grid">
          {checks.map((c) => (
            <ProviderPanel key={c.discovery.provider} check={c} />
          ))}
        </main>
      )}
    </div>
  );
}
