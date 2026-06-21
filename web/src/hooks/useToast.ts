import { useMemo } from 'react';
import { createToast, type ToastProps } from '@clickhouse/click-ui';

// Thin wrapper over Click UI's toast system (DL-027). Click UI's ToastProvider (mounted by
// ClickUIProvider) listens to the toast emitter; `createToast` fires into it. Containers / plugins /
// mutations use this hook so presentational components never import Click UI toast internals
// (DL-005/DL-023), and the mechanism is swappable in one place.
export interface Toaster {
  success: (title: string) => void;
  error: (title: string) => void;
  info: (title: string) => void;
  /** Full control (e.g. an action button) when a simple title isn't enough. */
  show: (toast: ToastProps) => void;
}

export function useToast(): Toaster {
  return useMemo<Toaster>(
    () => ({
      success: (title) => createToast({ type: 'success', title }),
      error: (title) => createToast({ type: 'danger', title }),
      info: (title) => createToast({ type: 'default', title }),
      show: (toast) => createToast(toast),
    }),
    [],
  );
}
