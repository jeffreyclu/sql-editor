import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorSurface } from './EditorSurface';

// Guards the schema-aware autocomplete wiring (DL-025): passing a `{ [table]: string[] }` schema
// must build a valid `sql({ schema })` extension and mount without throwing. (CodeMirror internals
// aren't asserted — DL-015 — only that the extension graph is well-formed.)
describe('EditorSurface', () => {
  it('mounts with a schema prop (autocomplete extension builds)', () => {
    const { container } = render(
      <EditorSurface
        value="SELECT * FROM orders"
        onChange={vi.fn()}
        schema={{ orders: ['id', 'total'], 'shop.orders': ['id', 'total'] }}
      />,
    );
    expect(container.querySelector('.editor-surface')).toBeTruthy();
  });

  it('mounts without a schema prop (plain sql())', () => {
    const { container } = render(<EditorSurface value="SELECT 1" onChange={vi.fn()} />);
    expect(container.querySelector('.editor-surface')).toBeTruthy();
  });
});
