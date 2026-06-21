import { useRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EditorProvider, useEditorActions, useEditorDoc } from './EditorProvider';

// Counts its own renders; subscribes to the actions context only.
function ActionsOnly() {
  const renders = useRef(0);
  renders.current += 1;
  useEditorActions();
  return <span data-testid="actions-renders">{renders.current}</span>;
}

// Subscribes to the document and edits it.
function DocEditor() {
  const doc = useEditorDoc();
  const { setDoc } = useEditorActions();
  return (
    <input data-testid="doc-input" value={doc} onChange={(event) => setDoc(event.target.value)} />
  );
}

describe('EditorProvider', () => {
  it('does not re-render actions-only consumers when the document changes', () => {
    render(
      <EditorProvider>
        <ActionsOnly />
        <DocEditor />
      </EditorProvider>,
    );

    expect(screen.getByTestId('actions-renders')).toHaveTextContent('1');

    fireEvent.change(screen.getByTestId('doc-input'), { target: { value: 'SELECT 2;' } });
    fireEvent.change(screen.getByTestId('doc-input'), { target: { value: 'SELECT 3;' } });

    // The document changed twice; the actions-only consumer never re-rendered.
    expect(screen.getByTestId('actions-renders')).toHaveTextContent('1');
    expect(screen.getByTestId('doc-input')).toHaveValue('SELECT 3;');
  });
});
