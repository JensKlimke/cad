import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

import type { RuntimeDiagnostic } from '@cad/protocol';

export interface DocumentSourceEditorHandle {
  focusRange(start: number, end: number): void;
  focusStart(): void;
}

interface DocumentSourceEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly diagnostics: readonly RuntimeDiagnostic[];
  readonly activeDiagnosticIndex: number | null;
  readonly onSelectionChange?: (selection: { readonly start: number; readonly end: number }) => void;
}

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker(_: string, label: string): Worker;
    };
  }
}

let monacoConfigured = false;

export const DocumentSourceEditor = forwardRef<DocumentSourceEditorHandle, DocumentSourceEditorProps>(
  function DocumentSourceEditor({ value, onChange, diagnostics, activeDiagnosticIndex, onSelectionChange }, ref) {
    const hostReference = useRef<HTMLDivElement | null>(null);
    const editorReference = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const modelReference = useRef<monaco.editor.ITextModel | null>(null);
    const decorationCollectionReference = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
    const changeHandlerReference = useRef(onChange);
    const selectionHandlerReference = useRef(onSelectionChange);
    const isApplyingExternalChangeReference = useRef(false);
    const suppressSelectionEventsReference = useRef(false);

    const normalizedDiagnostics = useMemo(() => diagnostics, [diagnostics]);

    useEffect(() => {
      changeHandlerReference.current = onChange;
    }, [onChange]);

    useEffect(() => {
      selectionHandlerReference.current = onSelectionChange;
    }, [onSelectionChange]);

    useEffect(() => {
      configureMonaco();
      const host = hostReference.current;
      if (host === null || editorReference.current !== null) {
        return;
      }

      const model = monaco.editor.createModel(value, 'typescript');
      modelReference.current = model;

      const editor = monaco.editor.create(host, {
        model,
        automaticLayout: true,
        minimap: { enabled: false },
        lineNumbers: 'on',
        glyphMargin: true,
        roundedSelection: false,
        scrollBeyondLastLine: false,
        overviewRulerBorder: false,
        fontFamily: "'IBM Plex Mono', 'SFMono-Regular', monospace",
        fontSize: 14,
        lineHeight: 26,
        tabSize: 2,
        insertSpaces: true,
        wordWrap: 'on',
        theme: 'cad-dark',
        renderLineHighlight: 'all',
        padding: {
          top: 14,
          bottom: 18,
        },
      });
      editorReference.current = editor;
      decorationCollectionReference.current = editor.createDecorationsCollection();
      installEditorTestHooks(host, editor, model);
      const inputObserver = observeEditorInput(host);

      const contentChangeDisposable = editor.onDidChangeModelContent(() => {
        if (isApplyingExternalChangeReference.current) {
          return;
        }
        changeHandlerReference.current(editor.getValue());
      });
      const cursorChangeDisposable = editor.onDidChangeCursorSelection((event: monaco.editor.ICursorSelectionChangedEvent) => {
        if (isApplyingExternalChangeReference.current || suppressSelectionEventsReference.current) {
          return;
        }
        const nextSelection = event.selection;
        const activeModel = editor.getModel();
        if (activeModel === null) {
          return;
        }
        selectionHandlerReference.current?.({
          start: activeModel.getOffsetAt(nextSelection.getStartPosition()),
          end: activeModel.getOffsetAt(nextSelection.getEndPosition()),
        });
      });

      return () => {
        removeEditorTestHooks(host);
        inputObserver?.disconnect();
        cursorChangeDisposable.dispose();
        contentChangeDisposable.dispose();
        decorationCollectionReference.current?.clear();
        decorationCollectionReference.current = null;
        editor.dispose();
        editorReference.current = null;
        model.dispose();
        modelReference.current = null;
      };
    }, [value]);

    useEffect(() => {
      const editor = editorReference.current;
      const model = modelReference.current;
      if (editor === null || model === null || model.getValue() === value) {
        return;
      }
      const previousValue = model.getValue();
      const previousSelection = editor.getSelection();
      const previousScrollTop = typeof editor.getScrollTop === 'function' ? editor.getScrollTop() : null;
      const previousScrollLeft = typeof editor.getScrollLeft === 'function' ? editor.getScrollLeft() : null;
      isApplyingExternalChangeReference.current = true;
      suppressSelectionEventsReference.current = true;
      model.setValue(value);
      if (previousSelection !== null) {
        const nextSelection = mapSelectionThroughReplacement(previousValue, value, previousSelection, model);
        editor.setSelection(nextSelection);
      }
      if (previousScrollTop !== null && typeof editor.setScrollTop === 'function') {
        editor.setScrollTop(previousScrollTop);
      }
      if (previousScrollLeft !== null && typeof editor.setScrollLeft === 'function') {
        editor.setScrollLeft(previousScrollLeft);
      }
      suppressSelectionEventsReference.current = false;
      isApplyingExternalChangeReference.current = false;
    }, [value]);

    useEffect(() => {
      const model = modelReference.current;
      if (model === null) {
        return;
      }
      monaco.editor.setModelMarkers(model, 'cad-runtime', normalizedDiagnostics.map((diagnostic) => ({
        severity: monaco.MarkerSeverity.Error,
        message: diagnostic.message,
        code: diagnostic.code,
        startLineNumber: positionForOffset(model, diagnostic.range?.start ?? 0).lineNumber,
        startColumn: positionForOffset(model, diagnostic.range?.start ?? 0).column,
        endLineNumber: positionForOffset(model, diagnostic.range?.end ?? diagnostic.range?.start ?? 0).lineNumber,
        endColumn: normalizeMarkerEnd(model, diagnostic),
      })));
    }, [normalizedDiagnostics]);

    useEffect(() => {
      const editor = editorReference.current;
      const model = modelReference.current;
      const collection = decorationCollectionReference.current;
      if (editor === null || model === null || collection === null) {
        return;
      }
      const activeDiagnostic =
        activeDiagnosticIndex === null ? null : (diagnostics[activeDiagnosticIndex] ?? null);
      if (activeDiagnostic?.range === undefined) {
        collection.set([]);
        return;
      }
      const start = positionForOffset(model, activeDiagnostic.range.start);
      const end = positionForOffset(model, Math.max(activeDiagnostic.range.end, activeDiagnostic.range.start));
      collection.set([
        {
          range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, normalizeMarkerEnd(model, activeDiagnostic)),
          options: {
            className: 'monaco-diagnostic-range-active',
            isWholeLine: false,
          },
        },
      ]);
    }, [activeDiagnosticIndex, diagnostics]);

    useImperativeHandle(ref, () => ({
      focusRange(start, end) {
        const editor = editorReference.current;
        const model = modelReference.current;
        if (editor === null || model === null) {
          return;
        }
        const safeStart = clampOffset(start, model.getValueLength());
        const safeEnd = Math.max(safeStart, clampOffset(end, model.getValueLength()));
        const startPosition = positionForOffset(model, safeStart);
        const endPosition = positionForOffset(model, safeEnd);
        suppressSelectionEventsReference.current = true;
        editor.setSelection(new monaco.Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, normalizeEndColumn(model, safeEnd, endPosition)));
        editor.revealRangeInCenter(editor.getSelection() ?? new monaco.Range(1, 1, 1, 1));
        editor.focus();
        suppressSelectionEventsReference.current = false;
      },
      focusStart() {
        const editor = editorReference.current;
        if (editor === null) {
          return;
        }
        suppressSelectionEventsReference.current = true;
        editor.setPosition({ lineNumber: 1, column: 1 });
        editor.focus();
        suppressSelectionEventsReference.current = false;
      },
    }), []);

    return <div ref={hostReference} className="document-editor" data-testid="document-source-editor" />;
  },
);

DocumentSourceEditor.displayName = 'DocumentSourceEditor';

function configureMonaco(): void {
  if (monacoConfigured) {
    return;
  }
  monacoConfigured = true;
  globalThis.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      if (label === 'typescript' || label === 'javascript') {
        return new tsWorker();
      }
      return new editorWorker();
    },
  };
  monaco.editor.defineTheme('cad-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '7DD3FC' },
      { token: 'string', foreground: '86EFAC' },
      { token: 'number', foreground: 'FCA5A5' },
      { token: 'comment', foreground: '7A8CA6', fontStyle: 'italic' },
      { token: 'delimiter', foreground: 'CBD5E1' },
    ],
    colors: {
      'editor.background': '#08121f',
      'editor.lineHighlightBackground': '#16253e85',
      'editorLineNumber.foreground': '#73849c',
      'editorLineNumber.activeForeground': '#f1f5f9',
      'editorCursor.foreground': '#f8fafc',
      'editor.selectionBackground': '#60a5fa47',
      'editor.inactiveSelectionBackground': '#60a5fa2c',
      'editorGutter.background': '#08121f',
      'editorIndentGuide.background1': '#1e293b',
      'editorIndentGuide.activeBackground1': '#334155',
    },
  });
  const typescriptLanguage = monaco.languages.typescript as unknown as {
    readonly ScriptTarget: { readonly ESNext: number };
    readonly ModuleKind: { readonly ESNext: number };
    readonly ModuleResolutionKind: { readonly NodeJs: number };
    readonly typescriptDefaults: {
      setCompilerOptions(options: Record<string, unknown>): void;
      setDiagnosticsOptions(options: Record<string, unknown>): void;
    };
  };
  typescriptLanguage.typescriptDefaults.setCompilerOptions({
    target: typescriptLanguage.ScriptTarget.ESNext,
    module: typescriptLanguage.ModuleKind.ESNext,
    allowNonTsExtensions: true,
    moduleResolution: typescriptLanguage.ModuleResolutionKind.NodeJs,
    strict: true,
    noEmit: true,
  });
  typescriptLanguage.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
}

function tagEditorInput(host: HTMLDivElement): void {
  const input = host.querySelector('textarea.inputarea');
  input?.setAttribute('data-testid', 'document-source-editor-input');
  input?.setAttribute('aria-label', 'Document source editor');
}

function observeEditorInput(host: HTMLDivElement): MutationObserver | null {
  tagEditorInput(host);
  if (host.querySelector('textarea.inputarea') !== null || typeof MutationObserver === 'undefined') {
    return null;
  }
  const observer = new MutationObserver(() => {
    tagEditorInput(host);
    if (host.querySelector('textarea.inputarea') !== null) {
      observer.disconnect();
    }
  });
  observer.observe(host, { childList: true, subtree: true });
  return observer;
}

function installEditorTestHooks(
  host: HTMLDivElement,
  editor: monaco.editor.IStandaloneCodeEditor,
  model: monaco.editor.ITextModel,
): void {
  Object.assign(host, {
    __cadSetSource(nextSource: string) {
      editor.pushUndoStop();
      editor.executeEdits('cad-e2e-set-source', [
        {
          range: model.getFullModelRange(),
          text: nextSource,
          forceMoveMarkers: true,
        },
      ]);
      editor.pushUndoStop();
    },
    __cadGetSource() {
      return model.getValue();
    },
  });
}

function removeEditorTestHooks(host: HTMLDivElement): void {
  Reflect.deleteProperty(host, '__cadSetSource');
  Reflect.deleteProperty(host, '__cadGetSource');
}

function positionForOffset(model: monaco.editor.ITextModel, offset: number): monaco.Position {
  return model.getPositionAt(clampOffset(offset, model.getValueLength()));
}

function normalizeMarkerEnd(model: monaco.editor.ITextModel, diagnostic: RuntimeDiagnostic): number {
  if (diagnostic.range === undefined) {
    return 1;
  }
  const safeEnd = Math.max(diagnostic.range.end, diagnostic.range.start);
  const endPosition = positionForOffset(model, safeEnd);
  return normalizeEndColumn(model, safeEnd, endPosition);
}

function normalizeEndColumn(
  model: monaco.editor.ITextModel,
  offset: number,
  endPosition: monaco.Position,
): number {
  if (offset < model.getValueLength()) {
    return endPosition.column;
  }
  return Math.max(1, endPosition.column);
}

function clampOffset(offset: number, sourceLength: number): number {
  return Math.max(0, Math.min(offset, sourceLength));
}

function mapSelectionThroughReplacement(
  previousSource: string,
  nextSource: string,
  selection: monaco.Selection | monaco.Range,
  model: monaco.editor.ITextModel,
): monaco.Range {
  const previousStart = model.getOffsetAt(selection.getStartPosition());
  const previousEnd = model.getOffsetAt(selection.getEndPosition());
  const nextStart = mapOffsetThroughReplacement(previousSource, nextSource, previousStart);
  const nextEnd = mapOffsetThroughReplacement(previousSource, nextSource, previousEnd);
  const nextStartPosition = positionForOffset(model, nextStart);
  const nextEndPosition = positionForOffset(model, Math.max(nextStart, nextEnd));
  return new monaco.Range(
    nextStartPosition.lineNumber,
    nextStartPosition.column,
    nextEndPosition.lineNumber,
    normalizeEndColumn(model, Math.max(nextStart, nextEnd), nextEndPosition),
  );
}

function mapOffsetThroughReplacement(previousSource: string, nextSource: string, offset: number): number {
  const commonPrefixLength = sharedPrefixLength(previousSource, nextSource);
  const commonSuffixLength = sharedSuffixLength(previousSource, nextSource, commonPrefixLength);
  const previousChangedEnd = previousSource.length - commonSuffixLength;
  const nextChangedEnd = nextSource.length - commonSuffixLength;
  if (offset <= commonPrefixLength) {
    return offset;
  }
  if (offset >= previousChangedEnd) {
    return nextChangedEnd + (offset - previousChangedEnd);
  }
  return nextChangedEnd;
}

function sharedPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function sharedSuffixLength(left: string, right: string, prefixLength: number): number {
  const leftRemaining = left.length - prefixLength;
  const rightRemaining = right.length - prefixLength;
  const limit = Math.min(leftRemaining, rightRemaining);
  let index = 0;
  while (
    index < limit
    && left[left.length - 1 - index] === right[right.length - 1 - index]
  ) {
    index += 1;
  }
  return index;
}
