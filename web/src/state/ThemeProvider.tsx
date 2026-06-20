import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { ClickUIProvider } from '@clickhouse/click-ui';

// Owns the light/dark theme and feeds it to `ClickUIProvider` (which sets the root
// `data-cui-theme`, so the design tokens — and our token-based CSS — re-theme automatically).
// Reducer + action creators (DL-019); persistence is an effect so the reducer stays pure.

export type ThemeName = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeName;
  toggleTheme: () => void;
}

interface ThemeState {
  theme: ThemeName;
}

type ThemeAction = { type: 'toggle' } | { type: 'set'; theme: ThemeName };

function themeReducer(state: ThemeState, action: ThemeAction): ThemeState {
  switch (action.type) {
    case 'toggle':
      return { theme: state.theme === 'light' ? 'dark' : 'light' };
    case 'set':
      return state.theme === action.theme ? state : { theme: action.theme };
    default:
      return state;
  }
}

const STORAGE_KEY = 'sql-editor:theme';

function readTheme(): ThemeName {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(themeReducer, undefined, () => ({ theme: readTheme() }));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, state.theme);
    } catch {
      /* ignore */
    }
  }, [state.theme]);

  const toggleTheme = useCallback(() => dispatch({ type: 'toggle' }), []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: state.theme, toggleTheme }),
    [state.theme, toggleTheme],
  );

  // We manage persistence ourselves, so disable Click UI's own theme persistence.
  return (
    <ThemeContext.Provider value={value}>
      <ClickUIProvider theme={state.theme} persistTheme={false}>
        {children}
      </ClickUIProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a <ThemeProvider>.');
  return context;
}
