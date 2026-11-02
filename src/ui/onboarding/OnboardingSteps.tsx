import "./onboarding.css";

const steps = { repository: "Repository", agents: "Agents", first: "First task" } as const;
export type OnboardingStep = keyof typeof steps;

/** First run's three steps; earlier ones read as done. */
export function OnboardingSteps({ current }: { current: OnboardingStep }) {
  const ids = Object.keys(steps) as OnboardingStep[];
  const at = ids.indexOf(current);
  return (
    <ol className="onboarding-steps" aria-label="Getting started">
      {ids.map((id, i) => (
        <li
          key={id}
          aria-current={i === at ? "step" : undefined}
          data-state={i < at ? "done" : i === at ? "current" : "next"}
        >
          {steps[id]}
        </li>
      ))}
    </ol>
  );
}
