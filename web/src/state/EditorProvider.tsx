import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

// The editor document lives in its own provider so that typing only re-renders editor consumers,
// never the results pane (DL-010). Plain split React Context + `useReducer` — no custom store or
// selector layer (DL-019). A reducer + action creators keeps state transitions explicit and
// testable; persistence is a side effect, so the reducer stays pure.

export interface EditorContextValue {
  doc: string;
  setDoc: (doc: string) => void;
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

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => ({ doc: readPersistedDoc() }));

  // Best-effort persistence of the last script (ignored in e.g. private mode).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, state.doc);
    } catch {
      /* ignore */
    }
  }, [state.doc]);

  const setDoc = useCallback((doc: string) => dispatch({ type: 'setDoc', doc }), []);

  const value = useMemo<EditorContextValue>(() => ({ doc: state.doc, setDoc }), [state.doc, setDoc]);

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) throw new Error('useEditor must be used within an <EditorProvider>.');
  return context;
}
