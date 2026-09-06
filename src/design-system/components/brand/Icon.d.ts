import * as React from "react";

/** Lucide-backed icon. 1.75 stroke is the brand weight — do not vary per instance. */
export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Lucide icon name, kebab or Pascal ("arrow-right", "ArrowRight"). */
  name: string;
  /** 16 inline with text, 20 in buttons/lists, 24 standalone, 32 in feature tiles. */
  size?: number;
  strokeWidth?: number;
  color?: string;
}

export declare function Icon(props: IconProps): JSX.Element;
