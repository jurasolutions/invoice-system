import * as React from "react";

/** Label + hint/error wrapper for any form control. */
export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  /** Helper text shown below when there is no error. */
  hint?: string;
  /** Replaces hint and turns red. */
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children?: React.ReactNode;
}
export declare function Field(props: FieldProps): JSX.Element;
