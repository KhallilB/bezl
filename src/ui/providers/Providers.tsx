import {
  Badge,
  Button,
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
  capabilityRows,
  fixes,
  found,
  homeName,
  limitHit,
  notFound,
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
          label={signin.kind === "canary" ? "Canary tokens" : "Tokens"}
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
              <ul className="providers-windows" aria-label="Limit windows">
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
              <div>
                <Shows shown={limitHit(limits.detail.hit)} />
              </div>
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
        <Heading level={3} size="sm">
          Read-only
        </Heading>
        <Shows shown={overall.shown} />
      </Inline>
      {overall.detail ? (
        <Text size="sm" tone="muted">
          {overall.detail}
        </Text>
      ) : null}
      <ul className="providers-list" aria-label="Capabilities">
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
        <Heading level={3} size="sm">
          Coordination tiers
        </Heading>
        <Shows shown={overall.shown} />
      </Inline>
      <Text size="sm" tone="muted">
        {[overall.detail, "Recorded for batches; nothing uses them yet."]
          .filter(Boolean)
          .join(". ")}
      </Text>
      {rows.length > 0 ? (
        <ul className="providers-list" aria-label="Tiers">
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

function Fixes({ check }: { check: ProviderCheck }) {
  const list = fixes(check);
  if (list.length === 0) return null;
  return (
    <section className="providers-section">
      <Heading level={3} size="sm">
        To fix
      </Heading>
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
        {/* Not found: the first fix says so. */}
        {bin ? (
          <Inline gap="sm">
            <Code>{bin.path}</Code>
            <Badge mono preserveCase>
              {bin.version}
            </Badge>
          </Inline>
        ) : null}
        <Fixes check={check} />
        <SignIn check={check} />
        <ReadOnly check={check} />
        <Tiers check={check} />
        <UsageList check={check} />
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

function Writers({ checks }: { checks: ProviderCheck[] }) {
  const ready = readyShown(checks);
  if (ready)
    return (
      <div>
        <Shows shown={ready} />
      </div>
    );
  return (
    <Callout tone="warning" title="No writer available">
      Fix a CLI below, then Check again.
    </Callout>
  );
}

export function Providers({ checks, checking = false, error, onCheckAgain }: ProvidersProps) {
  const busy = checking || (checks === null && !error);
  return (
    <div className="providers-screen">
      <Container className="providers-content">
        <header className="providers-header">
          <div>
            <Heading level={1} size="xl">
              Providers
            </Heading>
            <Text tone="muted">Agent CLIs on PATH, identified by their version output.</Text>
          </div>
          {onCheckAgain ? (
            <Button variant="secondary" disabled={busy} onClick={onCheckAgain}>
              Check again
            </Button>
          ) : null}
        </header>
        {busy ? (
          <Status tone="running" live icon={<StateIcon state="running" />}>
            Checking agent CLIs…
          </Status>
        ) : null}
        {error ? (
          <Callout tone="danger" role="alert" title="Preflight failed">
            {error}
          </Callout>
        ) : null}
        {checks === null ? null : (
          <>
            <Writers checks={checks} />
            <Grid className="providers-grid">
              {checks.map((c) => (
                <ProviderPanel key={c.discovery.provider} check={c} />
              ))}
            </Grid>
          </>
        )}
      </Container>
    </div>
  );
}
