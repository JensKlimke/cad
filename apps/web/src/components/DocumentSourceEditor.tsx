import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import {
  HighlightStyle,
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { linter, lintGutter, setDiagnostics } from '@codemirror/lint';
import { EditorSelection, EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

import type { RuntimeDiagnostic } from '@cad/protocol';
import type { Diagnostic } from '@codemirror/lint';

export interface DocumentSourceEditorHandle {
  focusRange(start: number, end: number): void;
  focusStart(): void;
}

interface DocumentSourceEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly diagnostics: readonly RuntimeDiagnostic[];
  readonly activeDiagnosticIndex: number | null;
}

const setActiveRangeEffect = StateEffect.define<{ readonly from: number; readonly to: number } | null>();

const activeDiagnosticField = StateField.define({
  create: () => Decoration.none,
  update(decorations, transaction) {
    // DecorationSet.map expects a ChangeDesc, not a callback function.
    // eslint-disable-next-line unicorn/no-array-callback-reference
    let nextDecorations = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setActiveRangeEffect)) {
        if (effect.value === null) {
          nextDecorations = Decoration.none;
          continue;
        }
        const builder = new RangeSetBuilder<Decoration>();
        builder.add(
          effect.value.from,
          effect.value.to,
          Decoration.mark({ class: 'cm-diagnostic-range-active' }),
        );
        nextDecorations = builder.finish();
      }
    }
    return nextDecorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const editorTheme = EditorView.theme({
  '&': {
    minHeight: '29rem',
    backgroundColor: 'transparent',
    color: 'var(--app-text)',
    fontFamily: "'IBM Plex Mono', 'SFMono-Regular', monospace",
    fontSize: '0.92rem',
  },
  '.cm-scroller': {
    minHeight: '29rem',
    overflow: 'auto',
    lineHeight: '1.65',
    fontFamily: 'inherit',
  },
  '.cm-content': {
    padding: '0.9rem 0',
    caretColor: 'var(--app-text)',
  },
  '.cm-line': {
    padding: '0 1rem 0 0.85rem',
  },
  '.cm-gutters': {
    borderRight: '1px solid rgba(160, 196, 255, 0.08)',
    backgroundColor: 'rgba(8, 18, 31, 0.82)',
    color: 'rgba(201, 214, 231, 0.48)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    color: 'rgba(241, 245, 249, 0.82)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(22, 37, 62, 0.52)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(96, 165, 250, 0.28)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: '#f8fafc',
  },
  '.cm-lintRange, .cm-lintRange-error': {
    backgroundColor: 'rgba(248, 113, 113, 0.16)',
    textDecoration: 'underline 1px rgba(248, 113, 113, 0.6)',
  },
  '.cm-diagnostic-range-active': {
    backgroundColor: 'rgba(254, 202, 202, 0.2)',
    outline: '1px solid rgba(254, 202, 202, 0.56)',
    borderRadius: '0.2rem',
  },
  '.cm-tooltip.cm-tooltip-lint': {
    border: '1px solid rgba(248, 113, 113, 0.32)',
    backgroundColor: 'rgba(32, 10, 10, 0.96)',
    color: 'var(--app-text)',
  },
  '.cm-foldPlaceholder': {
    border: '1px solid rgba(160, 196, 255, 0.16)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    color: 'var(--app-text-muted)',
  },
});

const editorHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#7dd3fc' },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: '#f8fafc' },
  { tag: [tags.propertyName, tags.function(tags.variableName)], color: '#fde68a' },
  { tag: [tags.number, tags.bool, tags.null], color: '#fca5a5' },
  { tag: [tags.string, tags.special(tags.string)], color: '#86efac' },
  { tag: [tags.comment], color: '#7a8ca6', fontStyle: 'italic' },
  { tag: [tags.operator, tags.punctuation, tags.separator], color: '#cbd5e1' },
  { tag: [tags.definition(tags.variableName), tags.labelName], color: '#c4b5fd' },
  { tag: [tags.typeName, tags.className], color: '#f9a8d4' },
]);

export const DocumentSourceEditor = forwardRef<DocumentSourceEditorHandle, DocumentSourceEditorProps>(
  function DocumentSourceEditor({ value, onChange, diagnostics, activeDiagnosticIndex }, ref) {
    const hostReference = useRef<HTMLDivElement | null>(null);
    const viewReference = useRef<EditorView | null>(null);
    const changeHandlerReference = useRef(onChange);
    const isSynchronizingReference = useRef(false);

    const lintDiagnostics = useMemo(() => diagnostics, [diagnostics]);

    useEffect(() => {
      changeHandlerReference.current = onChange;
    }, [onChange]);

    useEffect(() => {
      if (hostReference.current === null || viewReference.current !== null) {
        return;
      }
      const view = new EditorView({
        parent: hostReference.current,
        state: EditorState.create({
          doc: value,
          extensions: [
            lineNumbers(),
            foldGutter(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            drawSelection(),
            dropCursor(),
            EditorState.allowMultipleSelections.of(true),
            indentOnInput(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            syntaxHighlighting(editorHighlightStyle),
            bracketMatching(),
            rectangularSelection(),
            highlightActiveLine(),
            javascript({ typescript: true }),
            lintGutter(),
            linter(() => []),
            EditorView.contentAttributes.of({
              'data-testid': 'document-source-editor-input',
              'aria-label': 'Document source editor',
            }),
            activeDiagnosticField,
            keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
            editorTheme,
            EditorView.updateListener.of((update) => {
              if (!update.docChanged || isSynchronizingReference.current) {
                return;
              }
              changeHandlerReference.current(update.state.doc.toString());
            }),
          ],
        }),
      });
      viewReference.current = view;
      return () => {
        view.destroy();
        viewReference.current = null;
      };
    }, [value]);

    useEffect(() => {
      const view = viewReference.current;
      if (view === null) {
        return;
      }
      const currentValue = view.state.doc.toString();
      if (currentValue === value) {
        return;
      }
      isSynchronizingReference.current = true;
      view.dispatch({
        changes: { from: 0, to: currentValue.length, insert: value },
      });
      isSynchronizingReference.current = false;
    }, [value]);

    useEffect(() => {
      const view = viewReference.current;
      if (view === null) {
        return;
      }
      view.dispatch(setDiagnostics(view.state, toCodeMirrorDiagnostics(lintDiagnostics, view.state.doc.length)));
    }, [lintDiagnostics]);

    useEffect(() => {
      const view = viewReference.current;
      if (view === null) {
        return;
      }
      const activeDiagnostic =
        activeDiagnosticIndex === null ? null : (diagnostics[activeDiagnosticIndex] ?? null);
      view.dispatch({
        effects: setActiveRangeEffect.of(toActiveRange(activeDiagnostic, view.state.doc.length)),
      });
    }, [activeDiagnosticIndex, diagnostics]);

    useImperativeHandle(ref, () => ({
      focusRange(start, end) {
        const view = viewReference.current;
        if (view === null) {
          return;
        }
        const safeStart = clampOffset(start, view.state.doc.length);
        const safeEnd = clampOffset(Math.max(end, start), view.state.doc.length);
        view.dispatch({
          selection: EditorSelection.single(safeStart, safeEnd),
          scrollIntoView: true,
          effects: setActiveRangeEffect.of({
            from: safeStart,
            to: normalizeRangeEnd(safeStart, safeEnd, view.state.doc.length),
          }),
        });
        view.focus();
      },
      focusStart() {
        const view = viewReference.current;
        if (view === null) {
          return;
        }
        view.dispatch({
          selection: EditorSelection.cursor(0),
          scrollIntoView: true,
          effects: setActiveRangeEffect.of(null),
        });
        view.focus();
      },
    }), []);

    return <div ref={hostReference} className="document-editor" data-testid="document-source-editor" />;
  },
);

DocumentSourceEditor.displayName = 'DocumentSourceEditor';

function toActiveRange(
  diagnostic: RuntimeDiagnostic | null,
  sourceLength: number,
): { readonly from: number; readonly to: number } | null {
  if (diagnostic?.range === undefined) {
    return null;
  }
  const from = clampOffset(diagnostic.range.start, sourceLength);
  const to = normalizeRangeEnd(from, clampOffset(Math.max(diagnostic.range.end, diagnostic.range.start), sourceLength), sourceLength);
  return { from, to };
}

function normalizeRangeEnd(from: number, to: number, sourceLength: number): number {
  if (to > from) {
    return to;
  }
  if (from >= sourceLength) {
    return Math.max(0, sourceLength);
  }
  return Math.min(sourceLength, from + 1);
}

function clampOffset(offset: number, sourceLength: number): number {
  return Math.max(0, Math.min(offset, sourceLength));
}

function toCodeMirrorDiagnostics(
  runtimeDiagnostics: readonly RuntimeDiagnostic[],
  sourceLength: number,
): Diagnostic[] {
  return runtimeDiagnostics.map((diagnostic) => {
    const from = clampOffset(diagnostic.range?.start ?? 0, sourceLength);
    const to = diagnostic.range === undefined
      ? from
      : normalizeRangeEnd(from, clampOffset(Math.max(diagnostic.range.end, diagnostic.range.start), sourceLength), sourceLength);
    return {
      from,
      to,
      severity: 'error',
      source: diagnostic.code,
      message: diagnostic.message,
    };
  });
}
