import { useCallback } from 'react';
import { RunButton } from '../components/RunButton';
import { useEditor } from '../state/EditorProvider';
import { useQuery } from '../state/QueryProvider';

// Container: connects run state + the editor document to the pure RunButton.
export function RunControls() {
  const { doc } = useEditor();
  const { runState, run, cancel } = useQuery();
  const handleRun = useCallback(() => run(doc), [run, doc]);

  return (
    <RunButton
      isRunning={runState.status === 'running'}
      disabled={doc.trim().length === 0}
      onRun={handleRun}
      onCancel={cancel}
    />
  );
}
