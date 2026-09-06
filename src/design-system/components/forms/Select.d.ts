import * as React from "react";

export interface SelectOption { value: string; label: string }

/** Native select with Jura chrome. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: Array<SelectOption | string>;
  /** Empty first option. Pass "" to omit. */
  placeholder?: string;
  invalid?: boolean;
}
export declare function Select(props: SelectProps): JSX.Element;
