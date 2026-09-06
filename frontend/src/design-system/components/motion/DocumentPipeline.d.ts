import * as React from "react";

/** Documents in → filed results out, on a shared loop. Stacks to one column under 620px. */
export interface DocumentPipelineProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 2–4 inbound document names. */
  incoming?: string[];
  /** 1–3 outcomes, phrased as completed actions. */
  outgoing?: string[];
  /** Text inside the processor. \n allowed. */
  coreLabel?: string;
  duration?: number;
}
export declare function DocumentPipeline(props: DocumentPipelineProps): JSX.Element;
