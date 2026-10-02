import type { ReactNode } from "react";
import type { FeatureGateState } from "../../lib/features/gate";

export function FeatureGate({ state, featureKey, name, children }: {
  state: FeatureGateState;
  featureKey: string;
  name: string;
  children: ReactNode;
}): ReactNode {
  switch (state) {
    case "entitled":
      return children;
    case "upsell":
      return <a href={`/features/${featureKey}`}>
        {name} is part of a richer plan — see details
      </a>;
    case "coming-soon":
      return <span>{name} — coming soon</span>;
  }
}
