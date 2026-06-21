import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClickUIProvider } from '@clickhouse/click-ui';
import { examplesPlugin } from './examplesPlugin';
import { goldenQueries } from '../data/goldenQueries';

describe('examplesPlugin', () => {
  it('loads the selected golden query into the editor and leaves the panel open', () => {
    const setDoc = vi.fn();
    const close = vi.fn();
    render(
      <ClickUIProvider theme="light">
        {examplesPlugin.renderPanel({ setDoc, run: vi.fn() }, close)}
      </ClickUIProvider>,
    );

    const first = goldenQueries[0];
    fireEvent.click(screen.getByText(first.title));

    expect(setDoc).toHaveBeenCalledWith(first.sql);
    expect(close).not.toHaveBeenCalled();
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
