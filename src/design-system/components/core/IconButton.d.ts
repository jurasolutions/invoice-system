import * as React from "react";

/** Square icon-only control. Always give it a label — it becomes aria-label and tooltip. */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  /** Required accessible name, e.g. "Open menu". */
  label: string;
  variant?: "secondary" | "ghost" | "brand";
  /** sm 34 / md 42 / lg 48px. On mobile use md or lg to clear the 44px tap target. */
  size?: "sm" | "md" | "lg";
}

export declare function IconButton(props: IconButtonProps): JSX.Element;
