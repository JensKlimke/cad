import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  DocumentSourceEditor,
  type DocumentSourceEditorHandle,
} from '../src/components/DocumentSourceEditor.js';

import type { RuntimeDiagnostic } from '@cad/protocol';

const SOURCE = `export default {\n  value: 10,\n};\n`;

const monacoState = vi.hoisted(() => {
  const markerSpy = vi.fn();
  const setDecorationsSpy = vi.fn();
  const focusSpy = vi.fn();
  const setSelectionSpy = vi.fn();
  const revealRangeSpy = vi.fn();
  const executeEditsSpy = vi.fn();
  const setPositionSpy = vi.fn();
  const setScrollTopSpy = vi.fn();
  const setScrollLeftSpy = vi.fn();

  let contentListener: (() => void) | null = null;
  let selectionListener:
    | ((event: {
        readonly selection: {
          getStartPosition(): { lineNumber: number; column: number };
          getEndPosition(): { lineNumber: number; column: number };
        };
      }) => void)
    | null = null;

  const model = {
    value: `export default {\n  value: 10,\n};\n`,
    getValue() {
      return this.value;
    },
    setValue(nextValue: string) {
      this.value = nextValue;
    },
    getValueLength() {
      return this.value.length;
    },
    getFullModelRange() {
      return { startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 2 };
    },
    getPositionAt(offset: number) {
      const before = this.value.slice(0, offset);
      const lines = before.split('\n');
      return {
        lineNumber: lines.length,
        column: (lines.at(-1) ?? '').length + 1,
      };
    },
    getOffsetAt(position: { readonly lineNumber: number; readonly column: number }) {
      const lines = this.value.split('\n');
      let offset = 0;
      for (let index = 0; index < position.lineNumber - 1; index += 1) {
        offset += lines[index]!.length + 1;
      }
      return offset + position.column - 1;
    },
    dispose: vi.fn(),
  };

  const editor = {
    getValue() {
      return model.value;
    },
    getModel() {
      return model;
    },
    createDecorationsCollection() {
      return {
        set: setDecorationsSpy,
        clear: vi.fn(),
      };
    },
    onDidChangeModelContent(listener: () => void) {
      contentListener = listener;
      return { dispose: vi.fn() };
    },
    onDidChangeCursorSelection(listener: typeof selectionListener) {
      selectionListener = listener;
      return { dispose: vi.fn() };
    },
    pushUndoStop: vi.fn(),
    executeEdits: executeEditsSpy,
    setSelection: setSelectionSpy,
    getSelection() {
      return {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 7,
        getStartPosition() {
          return { lineNumber: 1, column: 1 };
        },
        getEndPosition() {
          return { lineNumber: 1, column: 7 };
        },
      };
    },
    revealRangeInCenter: revealRangeSpy,
    focus: focusSpy,
    setPosition: setPositionSpy,
    getScrollTop: vi.fn(() => 120),
    getScrollLeft: vi.fn(() => 24),
    setScrollTop: setScrollTopSpy,
    setScrollLeft: setScrollLeftSpy,
    dispose: vi.fn(),
  };

  return {
    markerSpy,
    setDecorationsSpy,
    focusSpy,
    setSelectionSpy,
    revealRangeSpy,
    executeEditsSpy,
    setPositionSpy,
    setScrollTopSpy,
    setScrollLeftSpy,
    get contentListener() {
      return contentListener;
    },
    get selectionListener() {
      return selectionListener;
    },
    model,
    editor,
  };
});

vi.mock('monaco-editor', () => ({
  editor: {
    createModel: vi.fn((value: string) => {
      monacoState.model.value = value;
      return monacoState.model;
    }),
    create: vi.fn(() => monacoState.editor),
    defineTheme: vi.fn(),
    setModelMarkers: monacoState.markerSpy,
  },
  languages: {
    typescript: {
      ScriptTarget: { ESNext: 99 },
      ModuleKind: { ESNext: 99 },
      ModuleResolutionKind: { NodeJs: 2 },
      typescriptDefaults: {
        setCompilerOptions: vi.fn(),
        setDiagnosticsOptions: vi.fn(),
      },
    },
  },
  MarkerSeverity: { Error: 8 },
  Range: class {
    constructor(
      readonly startLineNumber: number,
      readonly startColumn: number,
      readonly endLineNumber: number,
      readonly endColumn: number,
    ) {}
  },
}));

vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({
  default: class MockEditorWorker {},
}));

vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({
  default: class MockTsWorker {},
}));

describe('<DocumentSourceEditor />', () => {
  it('synchronizes source, diagnostics, and imperative focus actions through Monaco', async () => {
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

    render(<Harness />);
    expect(screen.getByTestId('document-source-editor')).toBeDefined();
    expect(monacoState.markerSpy).toHaveBeenCalled();
    expect(monacoState.setDecorationsSpy).toHaveBeenCalled();

    act(() => {
      monacoState.model.value = `${SOURCE}// changed internally\n`;
      monacoState.contentListener?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('editor-value').textContent).toContain('// changed internally');
    });

    await user.click(screen.getByRole('button', { name: 'Apply source update' }));
    await waitFor(() => {
      expect(screen.getByTestId('editor-value').textContent).toContain('// note');
    });
    expect(monacoState.model.value).toContain('// note');

    await user.click(screen.getByRole('button', { name: 'Focus diagnostic' }));
    expect(monacoState.setSelectionSpy).toHaveBeenCalled();
    expect(monacoState.revealRangeSpy).toHaveBeenCalled();
    expect(monacoState.focusSpy).toHaveBeenCalled();
  });
});
