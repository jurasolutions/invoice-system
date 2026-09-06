import * as React from "react";

/**
 * Bordered surface. Jura cards lean on hairline borders, not shadow.
 * @startingPoint section="Core" subtitle="Surface tones and hover lift" viewport="700x220"
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds hover lift + green border. Use only when the whole card is a link. */
  interactive?: boolean;
  tone?: "default" | "sunken" | "brand" | "inverse";
  /** CSS length; default --space-5. Use --space-6 for feature cards. */
  padding?: string;
}

export declare function Card(props: CardProps): JSX.Element;
