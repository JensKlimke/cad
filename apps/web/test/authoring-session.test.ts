import { describe, expect, it } from 'vitest';

import { parseAuthoringSource } from '../src/documents/authoring.js';
import {
  createAuthoringSessionState,
  createAuthoringSnapshot,
  pushAuthoringSnapshot,
  redoAuthoringSession,
  undoAuthoringSession,
} from '../src/documents/session.js';

const SOURCE = `import { body, defineDocument, feature, pad, parameters, reference, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 10, unit: 'mm' },
    depth: { kind: 'number', value: 20, unit: 'mm' },
    height: { kind: 'number', value: 30, unit: 'mm' },
  }),
  body: body([
    sketch({
      id: 'sketch_1',
      plane: 'xy',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="10" height="20" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
      constraints: {
        kind: 'rectangle',
        anchor: 'origin',
        width: { kind: 'reference', name: 'width' },
        height: { kind: 'reference', name: 'depth' },
      },
    }),
    pad({ id: 'pad_1', sketch: feature('sketch_1'), length: reference('height'), direction: 'up' }),
  ]),
});
`;

describe('authoring session history', () => {
  it('tracks snapshots and restores them through undo and redo', () => {
    const parsed = parseAuthoringSource(SOURCE);
    const session = createAuthoringSessionState(SOURCE, parsed, null);
    const editedSource = SOURCE.replace('value: 10', 'value: 12');
    const editedSnapshot = createAuthoringSnapshot(
      editedSource,
      parseAuthoringSource(editedSource),
      session.present.lastValidAst,
      session.present.selection,
    );

    const withEdit = pushAuthoringSnapshot(session, editedSnapshot);
    expect(withEdit.present.source).toContain('value: 12');
    expect(withEdit.past).toHaveLength(1);

    const undone = undoAuthoringSession(withEdit);
    expect(undone.present.source).toContain('value: 10');
    expect(undone.future).toHaveLength(1);

    const redone = redoAuthoringSession(undone);
    expect(redone.present.source).toContain('value: 12');
    expect(redone.past).toHaveLength(1);
  });

  it('keeps the last valid AST available while the current source is invalid', () => {
    const parsed = parseAuthoringSource(SOURCE);
    const session = createAuthoringSessionState(SOURCE, parsed, null);
    const invalidSource = "import fs from 'node:fs';\nexport default {};\n";
    const invalidSnapshot = createAuthoringSnapshot(
      invalidSource,
      parseAuthoringSource(invalidSource),
      session.present.lastValidAst,
      session.present.selection,
    );

    const next = pushAuthoringSnapshot(session, invalidSnapshot);
    expect(next.present.parseError).not.toBeNull();
    expect(next.present.ast).toBeNull();
    expect(next.present.lastValidAst).not.toBeNull();
  });
});
