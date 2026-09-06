import * as React from "react";

/** Counting proportion meter, triggered when scrolled into view. */
export interface EffortMeterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100. Use defensible ranges only. */
  value?: number;
  /** "%+" by default — the "+" keeps the claim honest. */
  suffix?: string;
  label?: string;
}
export declare function EffortMeter(props: EffortMeterProps): JSX.Element;
