import { useMemo, useRef } from 'react';
import { keymap } from '@uiw/react-codemirror';
import type { Extension } from '@codemirror/state';
import { EditorSurface } from '../components/EditorSurface';
import { useEditor } from '../state/EditorProvider';
import { useQuery } from '../state/QueryProvider';

// Container: connects the editor document + run action to the pure EditorSurface. Connected
// components live in containers/ because they consume hooks/state; components/ stays pure (DL-005).
export function EditorPane() {
  const { doc, setDoc } = useEditor();
  const { run } = useQuery();

  // Keep the latest doc in a ref so the Cmd/Ctrl+Enter binding reads it without rebuilding the
  // CodeMirror extension on every keystroke.
  const docRef = useRef(doc);
  docRef.current = doc;

  const extensions = useMemo<Extension[]>(
    () => [
      keymap.of([
        {
          key: 'Mod-Enter',
          preventDefault: true,
          run: () => {
            run(docRef.current);
            return true;
          },
        },
      ]),
    ],
    [run],
  );

  return <EditorSurface value={doc} onChange={setDoc} extensions={extensions} />;
}
