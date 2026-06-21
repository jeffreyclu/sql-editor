import type { ResultAction } from './types';
import { csvExportPlugin } from './csvExportPlugin';

// Registry of result-pane action plugins (DL-006). Add an action here to surface it on every
// statement result it applies to — no results-core change (OCP).
export const resultActions: ResultAction[] = [csvExportPlugin];
