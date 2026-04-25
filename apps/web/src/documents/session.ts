import { resolveSelection, type ParsedAuthoringState } from './authoring.js';

import type { AstNodeSelection, DocumentAST } from '@cad/authoring';

export interface AuthoringSnapshot {
  readonly source: string;
  readonly ast: DocumentAST | null;
  readonly lastValidAst: DocumentAST | null;
  readonly parseError: string | null;
  readonly selection: AstNodeSelection | null;
}

export interface AuthoringSessionState {
  readonly past: readonly AuthoringSnapshot[];
  readonly present: AuthoringSnapshot;
  readonly future: readonly AuthoringSnapshot[];
}

export function createAuthoringSnapshot(
  source: string,
  parsed: ParsedAuthoringState,
  previousLastValidAst: DocumentAST | null,
  selection: AstNodeSelection | null,
): AuthoringSnapshot {
  const nextLastValidAst = parsed.ast ?? previousLastValidAst;
  return {
    source,
    ast: parsed.ast,
    lastValidAst: nextLastValidAst,
    parseError: parsed.error,
    selection: resolveSelection(nextLastValidAst, selection),
  };
}

export function createAuthoringSessionState(
  source: string,
  parsed: ParsedAuthoringState,
  selection: AstNodeSelection | null,
): AuthoringSessionState {
  const snapshot = createAuthoringSnapshot(source, parsed, parsed.ast, selection);
  return {
    past: [],
    present: snapshot,
    future: [],
  };
}

export function pushAuthoringSnapshot(
  state: AuthoringSessionState,
  snapshot: AuthoringSnapshot,
): AuthoringSessionState {
  if (
    snapshot.source === state.present.source
    && snapshot.parseError === state.present.parseError
    && sameSelection(snapshot.selection, state.present.selection)
  ) {
    return {
      ...state,
      present: snapshot,
    };
  }
  return {
    past: [...state.past, state.present],
    present: snapshot,
    future: [],
  };
}

export function undoAuthoringSession(state: AuthoringSessionState): AuthoringSessionState {
  const previous = state.past.at(-1);
  if (previous === undefined) {
    return state;
  }
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
  };
}

export function redoAuthoringSession(state: AuthoringSessionState): AuthoringSessionState {
  const [next, ...remaining] = state.future;
  if (next === undefined) {
    return state;
  }
  return {
    past: [...state.past, state.present],
    present: next,
    future: remaining,
  };
}

function sameSelection(left: AstNodeSelection | null, right: AstNodeSelection | null): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }
  return left.kind === right.kind && left.id === right.id;
}
