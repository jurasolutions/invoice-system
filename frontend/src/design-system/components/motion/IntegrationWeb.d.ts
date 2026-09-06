import * as React from "react";

/** Radial integration diagram with data pulsing toward the hub. Square, max 460px. */
export interface IntegrationWebProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 4–7 system names. Generic categories read better than vendor names. */
  systems?: string[];
  /** Seconds per pulse pass. */
  duration?: number;
}
export declare function IntegrationWeb(props: IntegrationWebProps): JSX.Element;
