import * as React from "react";

/** Filter / keyword chip. Selectable and optionally removable. */
export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  selected?: boolean;
  onRemove?: (e: React.MouseEvent) => void;
  icon?: React.ReactNode;
}

export declare function Tag(props: TagProps): JSX.Element;
