import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClickUIProvider } from '@clickhouse/click-ui';
import { examplesPlugin } from './examplesPlugin';
import { goldenQueries } from '../data/goldenQueries';

describe('examplesPlugin', () => {
  it('loads the selected golden query into the editor', () => {
    const setDoc = vi.fn();
    render(
      <ClickUIProvider theme="light">
        {examplesPlugin.renderPanel({ setDoc, run: vi.fn() }, () => {})}
      </ClickUIProvider>,
    );

    // Clicking the card (here via its title) loads the query.
    fireEvent.click(screen.getByText(goldenQueries[0].title));

    expect(setDoc).toHaveBeenCalledWith(goldenQueries[0].sql);
  });
});

describe('goldenQueries', () => {
  it('has unique ids and covers the key categories (DL-016)', () => {
    const ids = goldenQueries.map((query) => query.id);
    expect(new Set(ids).size).toBe(ids.length);

    const categories = new Set(goldenQueries.map((query) => query.category));
    expect(categories).toContain('multi-statement');
    expect(categories).toContain('error');
  });
});
