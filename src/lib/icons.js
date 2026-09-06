/**
 * The design system's `Icon` component draws from a global `window.lucide`
 * (it was written against the Lucide UMD build). We register only the icons
 * this app uses, so the bundle carries a handful of glyphs rather than the
 * whole Lucide set.
 *
 * Adding an icon to a screen means adding it here too — `Icon` renders nothing
 * for a name it cannot find.
 */
import {
  createElement,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  FileCheck2,
  FilePlus2,
  FileText,
  GripVertical,
  Lock,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide";

const icons = {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  FileCheck2,
  FilePlus2,
  FileText,
  GripVertical,
  Lock,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Users,
  Wallet,
  X,
};

export function registerIcons() {
  window.lucide = { ...(window.lucide ?? {}), ...icons, icons, createElement };
}
