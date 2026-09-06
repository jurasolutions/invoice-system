import * as React from "react";

export interface TabItem { id: string; label: React.ReactNode }

/**
 * Underlined tab bar. Scrolls horizontally on mobile rather than wrapping.
 * @startingPoint section="Navigation" subtitle="Tabs and accordion" viewport="700x260"
 */
export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  tabs: Array<TabItem | string>;
  /** Controlled active id. Omit for internal state. */
  value?: string;
  onChange?: (id: string) => void;
}
export declare function Tabs(props: TabsProps): JSX.Element;
