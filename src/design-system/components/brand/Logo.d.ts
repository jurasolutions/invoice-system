import * as React from "react";

/**
 * Jura Solutions logo — mark alone or full lockup.
 * @startingPoint section="Brand" subtitle="Mark, lockup and tagline variants" viewport="700x180"
 */
export interface LogoProps extends React.HTMLAttributes<HTMLElement> {
  /** "lockup" = mark + wordmark (default). "mark" = symbol only, for favicons and tight nav. */
  variant?: "lockup" | "mark";
  /** Colour of the mark. Use "white" only on --green-800/900 or photography. */
  tone?: "green" | "ink" | "white";
  /** Height of the mark in px; the wordmark scales from it. Min 24 for legibility. */
  size?: number;
  /** Show the "AUTOMATION CONSULTANCY" mono tagline. Footer / first-touch use only. */
  showTagline?: boolean;
  /** Renders as an anchor when set. */
  href?: string;
}

export declare function Logo(props: LogoProps): JSX.Element;
