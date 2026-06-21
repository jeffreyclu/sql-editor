import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

// The editor document is high-frequency UI state. To keep typing from re-rendering anything that
// doesn't display the document, the editor exposes THREE contexts split by update frequency
// (DL-010) — still plain React Context (DL-019), no selector library:
//   • doc       — changes on every keystroke (only the editor surface reads it)
//   • isEmpty   — derived, flips rarely (the Run control reads it for its disabled state)
//   • actions   — stable for the component's lifetime (setDoc / getDoc)
// A consumer subscribes to only what it needs, so e.g. the plugin panel and the Run button never
// re-render while you type.

export interface EditorActions {
  setDoc: (doc: string) => void;
  /** Read the latest document without subscribing to it (for run-on-demand). */
  getDoc: () => string;
}

interface EditorState {
  doc: string;
}

type EditorAction = { type: 'setDoc'; doc: string };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'setDoc':
      return state.doc === action.doc ? state : { ...state, doc: action.doc };
    default:
      return state;
  }
}

const STORAGE_KEY = 'sql-editor:last-script';
const DEFAULT_DOC = 'SELECT 1;';

function readPersistedDoc(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_DOC;
  } catch {
    return DEFAULT_DOC;
  }
}

const EditorDocContext = createContext<string | null>(null);
const EditorIsEmptyContext = createContext<boolean | null>(null);
const EditorActionsContext = createContext<EditorActions | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => ({ doc: readPersistedDoc() }));

  // Mirror the latest doc into a ref so `getDoc` is stable yet always current.
  const docRef = useRef(state.doc);
  docRef.current = state.doc;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, state.doc);
    } catch {
      /* best-effort */
    }
  }, [state.doc]);

  const actions = useMemo<EditorActions>(
    () => ({
      setDoc: (doc: string) => dispatch({ type: 'setDoc', doc }),
      getDoc: () => docRef.current,
    }),
    [],
  );

  const isEmpty = state.doc.trim().length === 0;

  return (
    <EditorActionsContext.Provider value={actions}>
      <EditorIsEmptyContext.Provider value={isEmpty}>
        <EditorDocContext.Provider value={state.doc}>{children}</EditorDocContext.Provider>
      </EditorIsEmptyContext.Provider>
    </EditorActionsContext.Provider>
  );
}

export function useEditorDoc(): string {
  const doc = useContext(EditorDocContext);
  if (doc === null) throw new Error('useEditorDoc must be used within an <EditorProvider>.');
  return doc;
}

export function useEditorIsEmpty(): boolean {
  const isEmpty = useContext(EditorIsEmptyContext);
  if (isEmpty === null) throw new Error('useEditorIsEmpty must be used within an <EditorProvider>.');
  return isEmpty;
}

export function useEditorActions(): EditorActions {
  const actions = useContext(EditorActionsContext);
  if (!actions) throw new Error('useEditorActions must be used within an <EditorProvider>.');
  return actions;
}
