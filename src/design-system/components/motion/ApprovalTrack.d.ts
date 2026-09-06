import * as React from "react";

/** Approval progressing through stages, looping. Fits any width; labels wrap on mobile. */
export interface ApprovalTrackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 3–5 stage names, one or two words each. */
  stages?: string[];
  /** The item being approved — keep it concrete. */
  title?: string;
  /** Mono note on the right, e.g. "auto-routed". */
  meta?: string;
  duration?: number;
}
export declare function ApprovalTrack(props: ApprovalTrackProps): JSX.Element;
