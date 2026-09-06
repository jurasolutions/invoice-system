import * as React from "react";

export interface DashTile {
  key: string;
  /** Illustrative range the ticker moves within — never a claimed client figure. */
  from: number;
  to: number;
}

/** Operations board that refreshes on an interval. Two columns under 560px. */
export interface LiveDashboardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  /** Exactly 3 reads best. */
  tiles?: DashTile[];
  bars?: number;
  /** Refresh interval in ms. Below 1500 feels frantic. */
  interval?: number;
}
export declare function LiveDashboard(props: LiveDashboardProps): JSX.Element;
