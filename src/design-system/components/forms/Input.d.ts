import * as React from "react";

/**
 * Single-line text input.
 * @startingPoint section="Forms" subtitle="Inputs, select, checkbox, switch" viewport="700x300"
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Optional leading <Icon /> (search, mail). */
  iconLeft?: React.ReactNode;
}
export declare function Input(props: InputProps): JSX.Element;

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}
export declare function Textarea(props: TextareaProps): JSX.Element;
