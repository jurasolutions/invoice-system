import * as React from "react";

/**
 * Primary action control.
 * @startingPoint section="Core" subtitle="Variants, sizes and states" viewport="700x200"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = one per view. secondary = paired alternative. ghost = tertiary/inline. inverse = on --green-800/900. */
  variant?: "primary" | "secondary" | "ghost" | "inverse";
  size?: "sm" | "md" | "lg";
  /** Pass an <Icon />; 18px at sm/md, 20px at lg. */
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  /** Full width — mobile forms and cards only. */
  fullWidth?: boolean;
  href?: string;
  as?: keyof JSX.IntrinsicElements;
}

export declare function Button(props: ButtonProps): JSX.Element;
