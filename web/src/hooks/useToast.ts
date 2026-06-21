import { useMemo } from 'react';
import { createToast, type ToastProps } from '@clickhouse/click-ui';
import { truncateForToast } from '../api/formatError';

// `ToastType` isn't re-exported from the package root, so derive it from the prop contract.
type ToastType = NonNullable<ToastProps['type']>;

// Thin wrapper over Click UI's toast system (DL-027). Click UI's ToastProvider (mounted by
// ClickUIProvider) listens to the toast emitter; `createToast` fires into it. Containers / plugins /
// mutations use this hook so presentational components never import Click UI toast internals
// (DL-005/DL-023), and the mechanism is swappable in one place.
//
// Two cross-cutting concerns live here (DL-034): Click UI only tints the toast *icon* by type, so
// we attach a per-type class that `styles.css` uses to colour the whole surface (green/red/etc.);
// and error text (often a long ClickHouse message) is truncated so a toast can't cover the screen.
export interface Toaster {
  success: (title: string) => void;
  error: (title: string) => void;
  info: (title: string) => void;
  /** Full control (e.g. an action button) when a simple title isn't enough. */
  show: (toast: ToastProps) => void;
}

/** Per-type surface class consumed by `styles.css` (`default` reads as info). */
function toastClass(type: ToastType | undefined): string {
  const variant = type === 'default' || type === undefined ? 'info' : type;
  return `cui-toast cui-toast--${variant}`;
}

export function useToast(): Toaster {
  return useMemo<Toaster>(
    () => ({
      success: (title) => createToast({ type: 'success', title, className: toastClass('success') }),
      error: (title) =>
        createToast({ type: 'danger', title: truncateForToast(title), className: toastClass('danger') }),
      info: (title) => createToast({ type: 'default', title, className: toastClass('default') }),
      show: (toast) => createToast({ ...toast, className: toast.className ?? toastClass(toast.type) }),
    }),
    [],
  );
}
