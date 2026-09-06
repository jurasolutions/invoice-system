import * as React from "react";

/** Small status/label pill. */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
  /** Leading status dot — for live/running states. */
  dot?: boolean;
  /** Mono uppercase treatment, for section eyebrows and pipeline stages. */
  mono?: boolean;
}

export declare function Badge(props: BadgeProps): JSX.Element;
