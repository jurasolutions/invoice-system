import * as React from "react";

export interface FlowStep { label: string; detail?: string }

/** Looping left-to-right process diagram. Stacks vertically under 680px. */
export interface AutomationFlowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 3–5 stages. Labels one word, details ≤4 words. */
  steps?: FlowStep[];
  /** Seconds for one full pass. 4.8 default; 3.2 for tighter contexts. */
  duration?: number;
}
export declare function AutomationFlow(props: AutomationFlowProps): JSX.Element;
