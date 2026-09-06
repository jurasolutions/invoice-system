import * as React from "react";

/** Checkbox with inline label. 44px minimum row height for touch. */
export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
}
export declare function Checkbox(props: CheckboxProps): JSX.Element;

/** Radio for one-of-N. Always pass a shared name. */
export interface RadioProps extends CheckboxProps { name?: string }
export declare function Radio(props: RadioProps): JSX.Element;

/** Switch for an immediate on/off setting (portal toggles), not for form submission. */
export interface SwitchProps extends CheckboxProps {}
export declare function Switch(props: SwitchProps): JSX.Element;
