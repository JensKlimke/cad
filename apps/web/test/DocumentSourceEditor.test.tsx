import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import {
  DocumentSourceEditor,
  type DocumentSourceEditorHandle,
} from '../src/components/DocumentSourceEditor.js';

import type { RuntimeDiagnostic } from '@cad/protocol';

const SOURCE = `export default {
  value: 10,
};
`;

describe('<DocumentSourceEditor />', () => {
  it('renders the current source, propagates edits, and highlights the active diagnostic', async () => {
    const user = userEvent.setup();
    const diagnostics: readonly RuntimeDiagnostic[] = [
      {
        code: 'runtime.unsupported_import',
        message: 'Only "@cad/sdk" imports are allowed.',
        range: { start: 0, end: 6 },
        path: ['imports', '0'],
      },
    ];

    function Harness(): React.JSX.Element {
      const [value, setValue] = useState(SOURCE);
      const editorReference = useRef<DocumentSourceEditorHandle | null>(null);

      return (
        <>
          <DocumentSourceEditor
            ref={editorReference}
            value={value}
            diagnostics={diagnostics}
            activeDiagnosticIndex={0}
            onChange={setValue}
          />
          <button type="button" onClick={() => setValue(`${SOURCE}// note\n`)}>
            Apply source update
          </button>
          <button type="button" onClick={() => editorReference.current?.focusRange(0, 6)}>
            Focus diagnostic
          </button>
          <output data-testid="editor-value">{value}</output>
        </>
      );
    }

    const { container } = render(<Harness />);
    const editor = screen.getByTestId('document-source-editor');
    const content = editor.querySelector('.cm-content') as HTMLElement | null;
    expect(content?.textContent).toContain('export default');
    expect(container.querySelector('.cm-diagnostic-range-active')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Apply source update' }));
    await waitFor(() => {
      expect(screen.getByTestId('editor-value').textContent).toContain('// note');
    });
    expect(editor.querySelector('.cm-content')?.textContent).toContain('// note');

    await user.click(screen.getByRole('button', { name: 'Focus diagnostic' }));
    await waitFor(() => {
      expect(document.activeElement?.closest('[data-testid="document-source-editor"]')).not.toBeNull();
    });
  });
});
