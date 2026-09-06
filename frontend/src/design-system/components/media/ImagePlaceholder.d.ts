import * as React from "react";

/** Striped stand-in for imagery Jura has not supplied yet. */
export interface ImagePlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Say exactly what goes here, e.g. "screen recording: invoice bot". */
  label?: string;
  /** CSS aspect-ratio string. Ignored when height is set. */
  ratio?: string;
  radius?: string;
  /** "dark" for placement on --green-900 sections. */
  tone?: "light" | "dark";
  height?: number | string;
}

export declare function ImagePlaceholder(props: ImagePlaceholderProps): JSX.Element;
