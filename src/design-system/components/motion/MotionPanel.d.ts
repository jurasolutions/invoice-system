import * as React from "react";

/**
 * Wrapper that frames an animated diagram.
 * @startingPoint section="Motion" subtitle="Looping automation graphics" viewport="700x380"
 */
export interface MotionPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Mono caption below the graphic — say what the viewer is watching. */
  caption?: React.ReactNode;
  tone?: "light" | "dark";
  padding?: string;
}
export declare function MotionPanel(props: MotionPanelProps): JSX.Element;
