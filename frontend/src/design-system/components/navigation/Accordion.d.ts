import * as React from "react";

export interface AccordionItem { question?: string; title?: string; answer?: React.ReactNode; body?: React.ReactNode }

/** Hairline-divided disclosure list. Used for FAQs and long service detail. */
export interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  items: AccordionItem[];
  /** Allow several panels open at once. Default: one at a time. */
  allowMultiple?: boolean;
}
export declare function Accordion(props: AccordionProps): JSX.Element;
