import * as React from "react";

/** Transient confirmation, bottom-centre on mobile, bottom-right on desktop. Auto-dismisses after 4s. */
export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  message: React.ReactNode;
  tone?: "success" | "warning" | "danger";
  icon?: React.ReactNode;
  open?: boolean;
  onClose?: () => void;
}
export declare function Toast(props: ToastProps): JSX.Element;
