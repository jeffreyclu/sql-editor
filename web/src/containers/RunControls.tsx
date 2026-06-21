import { useCallback } from 'react';
import { RunButton } from '../components/RunButton';
import { useEditorActions, useEditorIsEmpty } from '../state/EditorProvider';
import { useQuery } from '../state/QueryProvider';

// Container: connects run state + the editor's emptiness to the pure RunButton. It reads `isEmpty`
// (which flips rarely) and the stable actions rather than the document itself, so typing does not
// re-render the toolbar (DL-010).
export function RunControls() {
  const isEmpty = useEditorIsEmpty();
  const { getDoc } = useEditorActions();
  const { runState, run, cancel } = useQuery();

  const handleRun = useCallback(() => run(getDoc()), [run, getDoc]);

  return (
    <RunButton
      isRunning={runState.status === 'running'}
      disabled={isEmpty}
      onRun={handleRun}
      onCancel={cancel}
    />
  );
}
