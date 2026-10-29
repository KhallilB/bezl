import {
  Badge,
  Callout,
  Code,
  Container,
  Grid,
  Heading,
  Inline,
  Panel,
  Status,
  Text,
} from "@kb.ui/react";
import { StateIcon } from "../task/icons";
import {
  canaryShown,
  found,
  homeName,
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

function ProviderPanel({ check }: { check: ProviderCheck }) {
  const { provider, found: bin, rejected } = check.discovery;
  const headingId = `provider-${provider}-title`;
  return (
    <Panel className="providers-panel" aria-labelledby={headingId}>
      <Panel.Header>
        <Heading level={2} size="md" id={headingId}>
          {providerName[provider]}
        </Heading>
        <Shows shown={bin ? found : notFound} />
      </Panel.Header>
      <Panel.Body className="providers-body">
        {bin ? (
          <Inline gap="sm">
            <Code>{bin.path}</Code>
            <Badge mono preserveCase>
              {bin.version}
            </Badge>
          </Inline>
        ) : (
          <Text tone="muted">{`No ${providerName[provider]} on PATH.`}</Text>
        )}
        <SignIn check={check} />
        {rejected.length > 0 ? (
          <section>
            <Heading level={3} size="sm">
              Rejected
            </Heading>
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
      </Panel.Body>
    </Panel>
  );
}

export function Providers({ checks, error }: ProvidersProps) {
  return (
    <div className="providers-screen">
      <Container className="providers-content">
        <header>
          <Heading level={1} size="xl">
            Providers
          </Heading>
          <Text tone="muted">Agent CLIs on PATH, identified by their version output.</Text>
        </header>
        {error ? (
          <Callout tone="danger" role="alert" title="Preflight failed">
            {error}
          </Callout>
        ) : checks === null ? (
          <Status tone="running" live icon={<StateIcon state="running" />}>
            Checking agent CLIs…
          </Status>
        ) : (
          <Grid className="providers-grid">
            {checks.map((c) => (
              <ProviderPanel key={c.discovery.provider} check={c} />
            ))}
          </Grid>
        )}
      </Container>
    </div>
  );
}
