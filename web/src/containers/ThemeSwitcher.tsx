import { Button } from '@clickhouse/click-ui';
import { useTheme } from '../state/ThemeProvider';

// Container: toggles light/dark via the theme provider. Pure Click UI Button (DL-017).
export function ThemeSwitcher() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      type="secondary"
      label={theme === 'light' ? '🌙 Dark' : '☀️ Light'}
      onClick={toggleTheme}
    />
  );
}
