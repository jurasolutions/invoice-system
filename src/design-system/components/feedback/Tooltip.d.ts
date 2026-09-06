import * as React from "react";

/** Hover/focus label for an icon-only control or an abbreviation. Keep under 6 words. */
export interface TooltipProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: React.ReactNode;
  placement?: "top" | "bottom" | "left" | "right";
  children?: React.ReactNode;
}
export declare function Tooltip(props: TooltipProps): JSX.Element;
