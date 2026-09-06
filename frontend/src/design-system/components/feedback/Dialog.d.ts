import * as React from "react";

/** Modal for a focused task — booking a call, confirming a destructive action. */
export interface DialogProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  title?: string;
  description?: string;
  /** Action row, right-aligned. Primary button last. */
  footer?: React.ReactNode;
  onClose?: () => void;
  /** Max width px. 520 default, 720 for forms. */
  width?: number;
}
export declare function Dialog(props: DialogProps): JSX.Element;
