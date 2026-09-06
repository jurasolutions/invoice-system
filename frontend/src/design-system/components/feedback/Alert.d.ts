import * as React from "react";

/**
 * Inline message attached to a form or page region.
 * @startingPoint section="Feedback" subtitle="Alerts, toast, tooltip, dialog" viewport="700x320"
 */
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  icon?: React.ReactNode;
  onDismiss?: () => void;
}
export declare function Alert(props: AlertProps): JSX.Element;
