/**
 * /projects/:id/documents/:docId route.
 *
 * Slice 4 dual-write workspace: feature tree + inspector + Monaco source editor
 * backed by the same canonical TypeScript document source, with builds rendered
 * in the viewport shell.
 */

import { useT } from '@cad/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useBlocker, useNavigate, useParams } from 'react-router';

import { ApiClientError } from '../../api/client.js';
import {
  buildToTessellation,
  diagnosticsFromError,
  downloadDocumentStl,
  useBuildDocument,
  useDocument,
  useDocumentBuildEvents,
  useDocumentBuildState,
  useDocumentBuildStreamState,
  useUpdateDocument,
} from '../../api/documents.js';
import { useProject } from '../../api/projects.js';
import { DocumentFeatureTree } from '../../components/DocumentFeatureTree.js';
import { DocumentInspector } from '../../components/DocumentInspector.js';
import {
  DocumentSourceEditor,
  type DocumentSourceEditorHandle,
} from '../../components/DocumentSourceEditor.js';
import { SketchModePanel } from '../../components/SketchModePanel.js';
import { WorkspaceShell } from '../../components/WorkspaceShell.js';
import {
  applyAuthoringOperation,
  createDefaultFeature,
  createDefaultParameter,
  defaultSelection,
  findSelectedFeature,
  findSelectedParameter,
  normalizeParameterDefinition,
  parseAuthoringSource,
  resolveSelection,
  selectionFromOffset,
} from '../../documents/authoring.js';
import { DEFAULT_DOCUMENT_SOURCE } from '../../documents/defaultSource.js';
import {
  createAuthoringSessionState,
  createAuthoringSnapshot,
  pushAuthoringSnapshot,
  redoAuthoringSession,
  undoAuthoringSession,
  type AuthoringSessionState,
} from '../../documents/session.js';
import { Viewport } from '../../viewport/Viewport.js';

import type { AstNodeSelection, FeatureAst } from '@cad/authoring';
import type { RuntimeDiagnostic } from '@cad/protocol';
import type { ParameterDefinition } from '@cad/sdk';

interface RoutedAuthoringSession {
  readonly docId: string | null;
  readonly serverSource: string;
  readonly history: AuthoringSessionState;
}

export function DocumentHostRoute(): React.JSX.Element {
  const { t } = useT('projects');
  const { id, docId } = useParams<{ id: string; docId: string }>();
  const navigate = useNavigate();
  const projectQuery = useProject(id);
  const documentQuery = useDocument(docId);
  const updateDocument = useUpdateDocument(docId ?? '');
  const buildDocument = useBuildDocument(docId ?? '');
  const buildStateQuery = useDocumentBuildState(docId);
  const buildStreamStateQuery = useDocumentBuildStreamState(docId);
  const editorReference = useRef<DocumentSourceEditorHandle | null>(null);
  const queuedAuthoringWritesReference = useRef<Promise<void>>(Promise.resolve());
  const [queuedAuthoringWrites, setQueuedAuthoringWrites] = useState(0);
  const [authoringSession, setAuthoringSession] = useState<RoutedAuthoringSession | null>(null);
  const [activeSketchModeFeatureId, setActiveSketchModeFeatureId] = useState<string | null>(null);
  const [activeDiagnosticIndex, setActiveDiagnosticIndex] = useState<number | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{
    readonly docId: string | null;
    readonly status: 'idle' | 'saving' | 'saved' | 'error';
    readonly message: string | null;
  }>({
    docId: null,
    status: 'idle',
    message: null,
  });
  const [buildFeedback, setBuildFeedback] = useState<{
    readonly docId: string | null;
    readonly status: 'idle' | 'running' | 'ready' | 'error';
    readonly diagnostics: readonly RuntimeDiagnostic[];
    readonly message: string | null;
    readonly hash: string | null;
  }>({
    docId: null,
    status: 'idle',
    diagnostics: [],
    message: null,
    hash: null,
  });
  const hasRouteParams = id !== undefined && docId !== undefined;

  const document = documentQuery.data;
  const project = projectQuery.data;
  const savedSource = document?.tsSource.length ? document.tsSource : DEFAULT_DOCUMENT_SOURCE;
  const initialParsedAuthoringState = useMemo(() => parseAuthoringSource(savedSource), [savedSource]);
  const initialSessionState = useMemo(
    () => createAuthoringSessionState(savedSource, initialParsedAuthoringState, defaultSelection(initialParsedAuthoringState.ast)),
    [initialParsedAuthoringState, savedSource],
  );
  const activeSession = authoringSession !== null && authoringSession.docId === docId
    ? authoringSession.history
    : initialSessionState;
  const draftSource = activeSession.present.source;
  const isDirty = document !== undefined && draftSource !== savedSource;
  const cachedBuild = buildStateQuery.data ?? undefined;
  const activeBuild = cachedBuild?.documentId === docId ? cachedBuild : undefined;
  const tessellation = activeBuild === undefined ? null : buildToTessellation(activeBuild);
  const activeSaveFeedback = saveFeedback.docId === docId ? saveFeedback : null;
  const activeBuildMessage = buildFeedback.docId === docId ? buildFeedback.message : null;
  const activeBuildStatus = buildFeedback.docId === docId ? buildFeedback.status : 'idle';
  const activeBuildHash = buildFeedback.docId === docId ? buildFeedback.hash : null;
  const buildDiagnostics = buildFeedback.docId === docId ? buildFeedback.diagnostics : [];
  const parameterEntries = useMemo(
    () => Object.values(activeBuild?.build.parameters ?? {}),
    [activeBuild],
  );
  const shouldBlockNavigation = isDirty && !updateDocument.isPending && !buildDocument.isPending;
  const navigationBlocker = useBlocker(shouldBlockNavigation);
  const streamBuildState = buildStreamStateQuery.data;
  const currentAst = activeSession.present.ast;
  const currentLastValidAst = activeSession.present.lastValidAst;
  const displayedAst = currentLastValidAst ?? currentAst;
  const sourceIsValid = currentAst !== null;
  const currentSelection = resolveSelection(
    displayedAst,
    activeSession.present.selection,
  );
  const currentParseError = activeSession.present.parseError;
  const selectedParameter = findSelectedParameter(displayedAst, currentSelection);
  const selectedFeature = findSelectedFeature(displayedAst, currentSelection);
  const activeSketchModeFeature = displayedAst === null
    ? null
    : (displayedAst.features.find(
        (feature): feature is Extract<FeatureAst, { kind: 'sketch' }> =>
          feature.kind === 'sketch' && feature.id === activeSketchModeFeatureId,
      ) ?? null);
  const canUndo = activeSession.past.length > 0;
  const canRedo = activeSession.future.length > 0;
  const authoringWritePending = queuedAuthoringWrites > 0;

  useDocumentBuildEvents(docId);

  useEffect(() => {
    if (docId === undefined) {
      return;
    }
    setAuthoringSession((current) => {
      if (current?.docId === docId) {
        return current;
      }
      return {
        docId,
        serverSource: savedSource,
        history: initialSessionState,
      };
    });
  }, [docId, initialSessionState, savedSource]);

  useEffect(() => {
    if (
      activeSketchModeFeatureId !== null
      && displayedAst !== null
      && !displayedAst.features.some((feature) => feature.kind === 'sketch' && feature.id === activeSketchModeFeatureId)
    ) {
      setActiveSketchModeFeatureId(null);
    }
  }, [activeSketchModeFeatureId, displayedAst]);

  useEffect(() => {
    if (docId === undefined) {
      return;
    }
    setAuthoringSession((current) => {
      if (current === null || current.docId !== docId) {
        return current;
      }
      if (current.serverSource === savedSource) {
        return current;
      }
      if (current.history.present.source === savedSource) {
        return {
          ...current,
          serverSource: savedSource,
        };
      }
      if (current.history.present.source === current.serverSource) {
        return {
          docId,
          serverSource: savedSource,
          history: initialSessionState,
        };
      }
      return {
        ...current,
        serverSource: savedSource,
      };
    });
  }, [docId, initialSessionState, savedSource]);

  useEffect(() => {
    if (
      !hasRouteParams
      || documentQuery.data === undefined
      || buildDocument.isPending
      || activeBuild !== undefined
      || updateDocument.isPending
    ) {
      return;
    }
    if (documentQuery.data.tsSource.length === 0) {
      void updateDocument
        .mutateAsync({ tsSource: DEFAULT_DOCUMENT_SOURCE })
        .then(() => {
          const parsed = parseAuthoringSource(DEFAULT_DOCUMENT_SOURCE);
          setAuthoringSession({
            docId: docId ?? null,
            serverSource: DEFAULT_DOCUMENT_SOURCE,
            history: createAuthoringSessionState(
              DEFAULT_DOCUMENT_SOURCE,
              parsed,
              defaultSelection(parsed.ast),
            ),
          });
          return buildDocument.mutateAsync();
        })
        .then((build) => {
          setBuildFeedback({
            docId: docId ?? null,
            status: 'ready',
            diagnostics: [],
            message: t('document_workspace.build_ready', {
              hash: resolveBuildHash(build.build).slice(0, 12),
            }),
            hash: resolveBuildHash(build.build),
          });
        })
        .catch((error: unknown) => {
          setBuildFeedback({
            docId: docId ?? null,
            status: 'error',
            diagnostics: diagnosticsFromError(error),
            message: error instanceof Error ? error.message : String(error),
            hash: null,
          });
        });
      return;
    }
    void buildDocument
      .mutateAsync()
      .then((build) => {
        setBuildFeedback({
          docId: docId ?? null,
          status: 'ready',
          diagnostics: [],
          message: t('document_workspace.build_ready', {
            hash: resolveBuildHash(build.build).slice(0, 12),
          }),
          hash: resolveBuildHash(build.build),
        });
      })
      .catch((error: unknown) => {
        setBuildFeedback({
          docId: docId ?? null,
          status: 'error',
          diagnostics: diagnosticsFromError(error),
          message: error instanceof Error ? error.message : String(error),
          hash: null,
        });
      });
  }, [activeBuild, buildDocument, docId, documentQuery.data, hasRouteParams, t, updateDocument]);

  useEffect(() => {
    if (navigationBlocker.state !== 'blocked') {
      return;
    }
    const shouldLeave = globalThis.confirm(t('document_workspace.leave_confirm'));
    if (shouldLeave) {
      navigationBlocker.proceed();
      return;
    }
    navigationBlocker.reset();
  }, [navigationBlocker, t]);

  const commitSessionSnapshot = useCallback((snapshot: Parameters<typeof pushAuthoringSnapshot>[1]) => {
    setAuthoringSession((current) => {
      if (docId === undefined) {
        return current;
      }
      const baseHistory = current?.docId === docId ? current.history : initialSessionState;
      return {
        docId,
        serverSource: savedSource,
        history: pushAuthoringSnapshot(baseHistory, snapshot),
      };
    });
  }, [docId, initialSessionState, savedSource]);

  const enqueueAuthoringWrite = useCallback(
    async <T,>(task: () => Promise<T>): Promise<T> => {
      setQueuedAuthoringWrites((current) => current + 1);
      const previous = queuedAuthoringWritesReference.current;
      let releaseQueue = () => {};
      queuedAuthoringWritesReference.current = new Promise<void>((resolve) => {
        releaseQueue = resolve;
      });
      await previous;
      try {
        return await task();
      } finally {
        releaseQueue();
        setQueuedAuthoringWrites((current) => Math.max(0, current - 1));
      }
    },
    [],
  );

  const persistDraft = useCallback(async (mode: 'manual' | 'autosave'): Promise<void> => {
    setSaveFeedback({
      docId: docId ?? null,
      status: 'saving',
      message: t(mode === 'autosave' ? 'document_workspace.autosaving' : 'document_workspace.saving'),
    });
    try {
      await updateDocument.mutateAsync({ tsSource: draftSource });
      setSaveFeedback({
        docId: docId ?? null,
        status: 'saved',
        message: t(mode === 'autosave' ? 'document_workspace.autosave_complete' : 'document_workspace.save_complete'),
      });
    } catch (error) {
      setSaveFeedback({
        docId: docId ?? null,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }, [docId, draftSource, t, updateDocument]);

  const handleUndo = useCallback(() => {
    if (!canUndo || docId === undefined) {
      return;
    }
    setAuthoringSession((current) => {
      const baseHistory = current?.docId === docId ? current.history : initialSessionState;
      return {
        docId,
        serverSource: savedSource,
        history: undoAuthoringSession(baseHistory),
      };
    });
  }, [canUndo, docId, initialSessionState, savedSource]);

  const handleRedo = useCallback(() => {
    if (!canRedo || docId === undefined) {
      return;
    }
    setAuthoringSession((current) => {
      const baseHistory = current?.docId === docId ? current.history : initialSessionState;
      return {
        docId,
        serverSource: savedSource,
        history: redoAuthoringSession(baseHistory),
      };
    });
  }, [canRedo, docId, initialSessionState, savedSource]);

  useEffect(() => {
    if (!hasRouteParams || document === undefined || !isDirty || updateDocument.isPending || buildDocument.isPending) {
      return;
    }
    const timeoutId = globalThis.setTimeout(() => {
      void persistDraft('autosave').catch(() => {});
    }, 1200);
    return () => globalThis.clearTimeout(timeoutId);
  }, [buildDocument.isPending, document, hasRouteParams, isDirty, persistDraft, updateDocument.isPending]);

  useEffect(() => {
    if (!shouldBlockNavigation) {
      return;
    }
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = '';
    }
    globalThis.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      globalThis.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [shouldBlockNavigation]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const isUndoShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z';
      if (!isUndoShortcut) {
        return;
      }
      if (event.shiftKey) {
        if (!canRedo) {
          return;
        }
        event.preventDefault();
        handleRedo();
        return;
      }
      if (!canUndo) {
        return;
      }
      event.preventDefault();
      handleUndo();
    }

    globalThis.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [canRedo, canUndo, handleRedo, handleUndo]);

  async function handleSave(): Promise<void> {
    await persistDraft('manual');
  }

  async function handleSaveAndBuild(): Promise<void> {
    try {
      setBuildFeedback({
        docId: docId ?? null,
        status: 'running',
        diagnostics: [],
        message: t('document_workspace.building_message'),
        hash: activeBuildHash,
      });
      if (isDirty) {
        await persistDraft('manual');
      }
      const build = await buildDocument.mutateAsync();
      setBuildFeedback({
        docId: docId ?? null,
        status: 'ready',
        diagnostics: [],
        message: t('document_workspace.build_ready', {
          hash: resolveBuildHash(build.build).slice(0, 12),
        }),
        hash: resolveBuildHash(build.build),
      });
    } catch (error) {
      const diagnostics = diagnosticsFromError(error);
      if (error instanceof ApiClientError) {
        setBuildFeedback({
          docId: docId ?? null,
          status: 'error',
          diagnostics,
          message: error.envelope.error.message,
          hash: activeBuildHash,
        });
      } else {
        setBuildFeedback({
          docId: docId ?? null,
          status: 'error',
          diagnostics,
          message: error instanceof Error ? error.message : String(error),
          hash: activeBuildHash,
        });
      }
    }
  }

  async function handleExportStl(): Promise<void> {
    if (docId === undefined) {
      return;
    }
    try {
      const blob = await downloadDocumentStl(docId);
      const url = URL.createObjectURL(blob);
      const link = globalThis.document.createElement('a');
      link.href = url;
      link.download = `${documentQuery.data?.name ?? 'document'}.stl`;
      link.click();
      URL.revokeObjectURL(url);
      setBuildFeedback((current) => ({
        ...current,
        docId,
        message: t('document_workspace.export_ready'),
      }));
    } catch (error) {
      setBuildFeedback((current) => ({
        ...current,
        docId,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async function applyUiOperation(op: Parameters<typeof applyAuthoringOperation>[1], nextSelection: AstNodeSelection | null): Promise<void> {
    if (!hasRouteParams || displayedAst === null || !sourceIsValid) {
      return;
    }
    await enqueueAuthoringWrite(async () => {
      const next = await applyAuthoringOperation(displayedAst, op);
      const resolvedSelection = resolveSelection(next.ast, nextSelection);
      flushSync(() => {
        commitSessionSnapshot(
          createAuthoringSnapshot(
            next.source,
            { ast: next.ast, error: null },
            next.ast,
            resolvedSelection,
          ),
        );
      });
    });
  }

  async function handleUpdateParameter(idToUpdate: string, name: string, definition: ParameterDefinition): Promise<void> {
    const selected = displayedAst?.parameters.find((parameter) => parameter.id === idToUpdate);
    if (selected === undefined) {
      return;
    }
    await applyUiOperation({
      kind: 'parameter.update',
      id: idToUpdate,
      parameter: {
        id: idToUpdate,
        name,
        definition: normalizeParameterDefinition(definition),
      },
    }, { kind: 'parameter', id: selected.id });
  }

  async function handleUpdateFeature(idToUpdate: string, feature: FeatureAst): Promise<void> {
    await applyUiOperation(
      {
        kind: 'feature.update',
        id: idToUpdate,
        feature,
      },
      { kind: 'feature', id: feature.id },
    );
  }

  async function handleAddParameter(): Promise<void> {
    if (displayedAst === null) {
      return;
    }
    const parameter = createDefaultParameter(displayedAst);
    await applyUiOperation(
      {
        kind: 'parameter.add',
        parameter,
      },
      { kind: 'parameter', id: parameter.id },
    );
  }

  async function handleAddFeature(kind: FeatureAst['kind']): Promise<void> {
    if (displayedAst === null) {
      return;
    }
    if (kind === 'pad' && !displayedAst.features.some((feature) => feature.kind === 'sketch')) {
      const sketch = createDefaultFeature(displayedAst, 'sketch');
      await applyUiOperation(
        {
          kind: 'feature.add',
          feature: sketch,
        },
        { kind: 'feature', id: sketch.id },
      );
      const pad = createDefaultFeature(
        {
          ...displayedAst,
          features: [...displayedAst.features, sketch],
        },
        'pad',
      );
      await applyUiOperation(
        {
          kind: 'feature.add',
          feature: pad,
        },
        { kind: 'feature', id: pad.id },
      );
      return;
    }
    const feature = createDefaultFeature(displayedAst, kind);
    await applyUiOperation(
      {
        kind: 'feature.add',
        feature,
      },
      { kind: 'feature', id: feature.id },
    );
    if (kind === 'sketch') {
      globalThis.setTimeout(() => {
        setActiveSketchModeFeatureId(feature.id);
      }, 0);
    }
  }

  async function handleRemoveParameter(parameterId: string): Promise<void> {
    await applyUiOperation(
      {
        kind: 'parameter.remove',
        id: parameterId,
      },
      null,
    );
  }

  async function handleRemoveFeature(featureId: string): Promise<void> {
    await applyUiOperation(
      {
        kind: 'feature.remove',
        id: featureId,
      },
      null,
    );
  }

  async function handleMoveFeature(featureId: string, direction: -1 | 1): Promise<void> {
    const index = displayedAst?.features.findIndex((feature) => feature.id === featureId) ?? -1;
    if (index === -1) {
      return;
    }
    await applyUiOperation(
      {
        kind: 'feature.reorder',
        id: featureId,
        index: index + direction,
      },
      { kind: 'feature', id: featureId },
    );
  }

  function handleSourceChange(nextValue: string): void {
    const parsed = parseAuthoringSource(nextValue);
    commitSessionSnapshot(
      createAuthoringSnapshot(
        nextValue,
        parsed,
        activeSession.present.lastValidAst,
        activeSession.present.selection,
      ),
    );
  }

  function handleEditorSelectionChange(selection: { readonly start: number; readonly end: number }): void {
    if (!sourceIsValid) {
      return;
    }
    setAuthoringSession((current) => {
      if (docId === undefined) {
        return current;
      }
      const baseHistory = current?.docId === docId ? current.history : initialSessionState;
      const ast = baseHistory.present.ast;
      return {
        docId,
        serverSource: savedSource,
        history: {
          ...baseHistory,
          present: {
            ...baseHistory.present,
            selection: selectionFromOffset(ast, selection.start),
          },
        },
      };
    });
  }

  function handleSelectNode(selection: AstNodeSelection): void {
    setAuthoringSession((current) => {
      if (docId === undefined) {
        return current;
      }
      const baseHistory = current?.docId === docId ? current.history : initialSessionState;
      return {
        docId,
        serverSource: savedSource,
        history: {
          ...baseHistory,
          present: {
            ...baseHistory.present,
            selection,
          },
        },
      };
    });
  }

  function handleEnterSketchMode(featureId: string): void {
    setActiveSketchModeFeatureId(featureId);
  }

  function handleExitSketchMode(): void {
    setActiveSketchModeFeatureId(null);
  }

  if (!hasRouteParams) {
    return <div>404</div>;
  }

  let buildButtonLabel = t('document_workspace.build');
  if (buildDocument.isPending) {
    buildButtonLabel = t('document_workspace.building');
  } else if (isDirty) {
    buildButtonLabel = t('document_workspace.save_and_build');
  }

  let viewportTitle = t('document_workspace.viewport_empty_title');
  let viewportBody = t('document_workspace.viewport_empty_body');
  if (buildDocument.isPending || streamBuildState?.kind === 'running') {
    viewportTitle = t('document_workspace.viewport_loading_title');
    viewportBody = t('document_workspace.viewport_loading_body');
  } else if (activeBuildStatus === 'error') {
    viewportTitle = t('document_workspace.viewport_error_title');
    viewportBody = t('document_workspace.viewport_error_body');
  }

  let saveStatusTone = 'workspace-status workspace-status--neutral';
  let saveStatusTitle = t('document_workspace.status_synced');
  let saveStatusBody = t('document_workspace.save_idle');
  switch (activeSaveFeedback?.status) {
    case 'saving': {
      saveStatusTone = 'workspace-status workspace-status--accent';
      saveStatusTitle = t('document_workspace.saving_title');
      saveStatusBody = activeSaveFeedback.message ?? t('document_workspace.saving');
      break;
    }
    case 'saved': {
      saveStatusTone = 'workspace-status workspace-status--success';
      saveStatusTitle = t('document_workspace.saved_title');
      saveStatusBody = activeSaveFeedback.message ?? t('document_workspace.save_complete');
      break;
    }
    case 'error': {
      saveStatusTone = 'workspace-status workspace-status--danger';
      saveStatusTitle = t('document_workspace.save_failed_title');
      saveStatusBody = activeSaveFeedback.message ?? t('document_workspace.save_failed_body');
      break;
    }
    default: {
      if (currentParseError !== null) {
        saveStatusTone = 'workspace-status workspace-status--warning';
        saveStatusTitle = t('document_workspace.source_invalid_title');
        saveStatusBody = currentParseError;
      } else if (isDirty) {
        saveStatusTone = 'workspace-status workspace-status--warning';
        saveStatusTitle = t('document_workspace.status_dirty');
        saveStatusBody = t('document_workspace.editing');
      }
      break;
    }
  }

  let buildStatusTone = 'workspace-status workspace-status--neutral';
  let buildStatusTitle = t('document_workspace.build_idle_title');
  let buildStatusBody = activeBuildMessage ?? t('document_workspace.build_note_body');
  switch (activeBuildStatus) {
    case 'running': {
      buildStatusTone = 'workspace-status workspace-status--accent';
      buildStatusTitle = t('document_workspace.building_title');
      buildStatusBody = activeBuildMessage ?? t('document_workspace.building_message');
      break;
    }
    case 'ready': {
      buildStatusTone = 'workspace-status workspace-status--success';
      buildStatusTitle = t('document_workspace.build_ready_title');
      buildStatusBody = activeBuildMessage ?? t('document_workspace.build_note_body');
      break;
    }
    case 'error': {
      buildStatusTone = 'workspace-status workspace-status--danger';
      buildStatusTitle = t('document_workspace.build_failed_title');
      buildStatusBody = activeBuildMessage ?? t('document_workspace.build_failed_body');
      break;
    }
    default: {
      break;
    }
  }

  let streamDiagnostics: readonly RuntimeDiagnostic[] | null = null;
  if (streamBuildState?.kind === 'failed') {
    streamDiagnostics = streamBuildState.diagnostics;
  } else if (streamBuildState?.kind === 'running' || streamBuildState?.kind === 'ready') {
    streamDiagnostics = [];
  }
  const parseDiagnostics: readonly RuntimeDiagnostic[] = currentParseError === null
    ? []
    : [{
        code: 'authoring.parse',
        message: currentParseError,
      }];
  const effectiveDiagnostics = resolveEffectiveDiagnostics(buildDiagnostics, streamDiagnostics, parseDiagnostics);
  const hasRemoteBuildRunning = !buildDocument.isPending && streamBuildState?.kind === 'running';
  const hasRemoteBuildFailure = !buildDocument.isPending && streamBuildState?.kind === 'failed';
  let effectiveBuildHash = activeBuild === undefined ? activeBuildHash : resolveBuildHash(activeBuild.build);
  if (streamBuildState?.kind === 'ready') {
    effectiveBuildHash = streamBuildState.hash;
  }
  let viewportSourceValue = t('document_workspace.viewport_source_saved');
  if (currentParseError !== null) {
    viewportSourceValue = t('document_workspace.viewport_source_invalid');
  } else if (isDirty) {
    viewportSourceValue = t('document_workspace.viewport_source_dirty');
  } else if (hasRemoteBuildRunning) {
    viewportSourceValue = t('document_workspace.viewport_source_remote_running');
  } else if (hasRemoteBuildFailure) {
    viewportSourceValue = t('document_workspace.viewport_source_remote_failed');
  }

  if (hasRemoteBuildRunning) {
    buildStatusTone = 'workspace-status workspace-status--accent';
    buildStatusTitle = t('document_workspace.building_title');
    buildStatusBody = t('document_workspace.remote_building_message');
  } else if (hasRemoteBuildFailure && streamBuildState?.kind === 'failed') {
    buildStatusTone = 'workspace-status workspace-status--danger';
    buildStatusTitle = t('document_workspace.build_failed_title');
    buildStatusBody = t('document_workspace.remote_build_failed_body');
  } else if (!buildDocument.isPending && streamBuildState?.kind === 'ready' && activeBuild !== undefined) {
    buildStatusTone = 'workspace-status workspace-status--success';
    buildStatusTitle = t('document_workspace.build_ready_title');
    buildStatusBody = t('document_workspace.build_ready', {
      hash: resolveBuildHash(activeBuild.build).slice(0, 12),
    });
  }

  const resolvedActiveDiagnosticIndex =
    effectiveDiagnostics.length === 0 ? null : Math.min(activeDiagnosticIndex ?? 0, effectiveDiagnostics.length - 1);
  const activeDiagnostic =
    resolvedActiveDiagnosticIndex === null ? null : (effectiveDiagnostics[resolvedActiveDiagnosticIndex] ?? null);
  const activeDiagnosticLocation = describeDiagnosticLocation(activeDiagnostic, draftSource);

  function focusDiagnostic(diagnostic: RuntimeDiagnostic, index: number): void {
    setActiveDiagnosticIndex(index);
    const editor = editorReference.current;
    if (editor === null) {
      return;
    }
    if (diagnostic.range !== undefined) {
      const safeStart = clampOffset(diagnostic.range.start, draftSource.length);
      const safeEnd = clampOffset(Math.max(diagnostic.range.end, diagnostic.range.start), draftSource.length);
      editor.focusRange(safeStart, safeEnd);
      return;
    }
    editor.focusStart();
  }

  const railBody = (
    <>
      <dl className="workspace-meta">
        <div className="workspace-meta__row">
          <dt>{t('document_workspace.project_label')}</dt>
          <dd>{project?.name ?? id}</dd>
        </div>
        <div className="workspace-meta__row">
          <dt>{t('document_workspace.document_label')}</dt>
          <dd>{docId}</dd>
        </div>
            <div className="workspace-meta__row">
              <dt>{t('document_workspace.status_label')}</dt>
              <dd>
                {describeDocumentState(
                  currentParseError,
                  isDirty,
                  t('document_workspace.status_out_of_sync'),
                  t('document_workspace.status_dirty'),
                  t('document_workspace.status_synced'),
                )}
              </dd>
            </div>
      </dl>
      <div className="document-note">
        <p className="document-note__title">{t('document_workspace.authoring_state_title')}</p>
        <p className="document-note__body">
          {currentParseError === null
            ? t('document_workspace.authoring_state_synced')
            : t('document_workspace.authoring_state_out_of_sync')}
        </p>
      </div>
      <div className="workspace-panel__subsection">
        <p className="workspace-panel__eyebrow">{t('document_workspace.result_eyebrow')}</p>
        <h3 className="workspace-panel__title workspace-panel__title--small">
          {t('document_workspace.result_title')}
        </h3>
        {activeBuild === undefined ? (
          <p className="workspace-inline-note">{t('document_workspace.result_empty')}</p>
        ) : (
          <dl className="workspace-meta workspace-meta--compact">
            <div className="workspace-meta__row">
              <dt>{t('document_workspace.hash_label')}</dt>
              <dd>{resolveBuildHash(activeBuild.build).slice(0, 12)}</dd>
            </div>
            {activeBuild.build.tessellation !== null && (
              <>
                <div className="workspace-meta__row">
                  <dt>{t('document_workspace.triangles_label')}</dt>
                  <dd>{activeBuild.build.tessellation.metadata.triangleCount}</dd>
                </div>
                <div className="workspace-meta__row">
                  <dt>{t('document_workspace.vertices_label')}</dt>
                  <dd>{activeBuild.build.tessellation.metadata.vertexCount}</dd>
                </div>
              </>
            )}
          </dl>
        )}
      </div>
      <div className="workspace-panel__subsection">
        <p className="workspace-panel__eyebrow">{t('document_workspace.parameters_eyebrow')}</p>
        <h3 className="workspace-panel__title workspace-panel__title--small">
          {t('document_workspace.parameters_title')}
        </h3>
        {parameterEntries.length === 0 ? (
          <p className="workspace-inline-note">{t('document_workspace.parameters_empty')}</p>
        ) : (
          <dl className="workspace-meta workspace-meta--compact">
            {parameterEntries.map((parameter) => (
              <div className="workspace-meta__row" key={parameter.name}>
                <dt>{parameter.name}</dt>
                <dd>
                  {parameter.value} {parameter.unit}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </>
  );

  let viewportContent: React.JSX.Element;
  if (activeSketchModeFeature !== null) {
    viewportContent = (
      <SketchModePanel
        feature={activeSketchModeFeature}
        parameters={displayedAst?.parameters ?? []}
        resolvedParameters={parameterEntries}
        onCommit={async (feature) => {
          await handleUpdateFeature(feature.id, feature);
        }}
        onExit={handleExitSketchMode}
      />
    );
  } else if (tessellation === null) {
    viewportContent = (
      <div className="workspace-state workspace-state--panel" data-testid="document-viewport-empty">
        <p className="workspace-state__title">{viewportTitle}</p>
        <p className="workspace-state__body">{viewportBody}</p>
      </div>
    );
  } else {
    viewportContent = <Viewport key={docId ?? 'viewport'} tessellation={tessellation} storageKey={docId} />;
  }

  return (
    <WorkspaceShell
      title={document?.name ?? t('document_workspace.title')}
      description={t('document_workspace.description')}
      railBody={railBody}
      testId="document-host"
      {...(project === undefined ? {} : { projectLink: { id, name: project.name } })}
      {...(document === undefined ? {} : { documentLink: { id: docId, name: document.name } })}
        headerActions={
          <div className="workspace-inline-actions">
          <button
            type="button"
            className="workspace-button workspace-button--ghost"
            onClick={handleUndo}
            disabled={!canUndo || authoringWritePending || updateDocument.isPending || buildDocument.isPending}
            data-testid="document-undo"
          >
            {t('document_workspace.undo')}
          </button>
          <button
            type="button"
            className="workspace-button workspace-button--ghost"
            onClick={handleRedo}
            disabled={!canRedo || authoringWritePending || updateDocument.isPending || buildDocument.isPending}
            data-testid="document-redo"
          >
            {t('document_workspace.redo')}
          </button>
          <button
            type="button"
            className="workspace-button workspace-button--secondary"
            onClick={() => navigate(`/projects/${id}`)}
          >
            {t('detail.back_to_projects')}
          </button>
          <button
            type="button"
            className="workspace-button workspace-button--ghost"
            onClick={() => void handleSave()}
            disabled={authoringWritePending || updateDocument.isPending || buildDocument.isPending || !isDirty}
            data-testid="document-save"
          >
            {t('document_workspace.save')}
          </button>
          <button
            type="button"
            className="workspace-button workspace-button--primary"
            onClick={() => void handleSaveAndBuild()}
            disabled={authoringWritePending || documentQuery.isPending || updateDocument.isPending || buildDocument.isPending}
            data-testid="document-build"
          >
            {buildButtonLabel}
          </button>
          <button
            type="button"
            className="workspace-button workspace-button--secondary"
            onClick={() => void handleExportStl()}
            disabled={activeBuild?.build.tessellation === null || activeBuild === undefined || buildDocument.isPending}
            data-testid="document-export-stl"
          >
            {t('document_workspace.export_stl')}
          </button>
        </div>
      }
    >
      <section
        className={
          activeSketchModeFeature === null
            ? 'document-workspace-grid document-workspace-grid--slice4'
            : 'document-workspace-grid document-workspace-grid--slice4 document-workspace-grid--sketch-mode'
        }
      >
        <div className="document-workspace-sidebar">
          <DocumentFeatureTree
            ast={displayedAst}
            selection={currentSelection}
            sourceIsValid={sourceIsValid && !authoringWritePending}
            onSelect={handleSelectNode}
            onAddParameter={() => void handleAddParameter()}
            onAddPad={() => void handleAddFeature('pad')}
            onAddSketch={() => void handleAddFeature('sketch')}
            onRemoveParameter={(parameterId) => void handleRemoveParameter(parameterId)}
            onRemoveFeature={(featureId) => void handleRemoveFeature(featureId)}
            onMoveFeature={(featureId, direction) => void handleMoveFeature(featureId, direction)}
          />
          <DocumentInspector
            parameter={selectedParameter}
            feature={selectedFeature}
            sourceIsValid={sourceIsValid && !authoringWritePending}
            onUpdateParameter={handleUpdateParameter}
            onUpdateFeature={handleUpdateFeature}
            onEnterSketchMode={handleEnterSketchMode}
          />
        </div>

        <section
          className={
            activeSketchModeFeature === null
              ? 'workspace-panel workspace-panel--editor'
              : 'workspace-panel workspace-panel--editor workspace-panel--muted'
          }
        >
          <div className="workspace-panel__header">
            <div>
              <p className="workspace-panel__eyebrow">{t('document_workspace.editor_eyebrow')}</p>
              <h2 className="workspace-panel__title">{t('document_workspace.editor_title')}</h2>
            </div>
          </div>
          <div className="workspace-status-grid" data-testid="document-workspace-status">
            <article className={saveStatusTone} data-testid="document-save-status">
              <p className="workspace-status__label">{t('document_workspace.save_status_label')}</p>
              <h3 className="workspace-status__title">{saveStatusTitle}</h3>
              <p className="workspace-status__body">{saveStatusBody}</p>
              {activeSaveFeedback?.status === 'error' && (
                <button
                  type="button"
                  className="workspace-inline-link"
                  onClick={() => void handleSave()}
                  disabled={authoringWritePending || updateDocument.isPending || buildDocument.isPending}
                  data-testid="document-save-retry"
                >
                  {t('document_workspace.retry_save')}
                </button>
              )}
            </article>
            <article className={buildStatusTone} data-testid="document-build-status">
              <p className="workspace-status__label">{t('document_workspace.build_status_label')}</p>
              <h3 className="workspace-status__title">{buildStatusTitle}</h3>
              <p className="workspace-status__body">{buildStatusBody}</p>
              {effectiveBuildHash !== null && (
                <p className="workspace-status__meta">
                  {t('document_workspace.hash_label')} {effectiveBuildHash.slice(0, 12)}
                </p>
              )}
              {(activeBuildStatus === 'error' || hasRemoteBuildFailure) && (
                <button
                  type="button"
                  className="workspace-inline-link"
                  onClick={() => void handleSaveAndBuild()}
                  disabled={authoringWritePending || documentQuery.isPending || updateDocument.isPending || buildDocument.isPending}
                  data-testid="document-build-retry"
                >
                  {t('document_workspace.retry_build')}
                </button>
              )}
            </article>
          </div>
          <DocumentSourceEditor
            ref={editorReference}
            value={draftSource}
            diagnostics={effectiveDiagnostics}
            activeDiagnosticIndex={resolvedActiveDiagnosticIndex}
            onChange={handleSourceChange}
            onSelectionChange={handleEditorSelectionChange}
          />
          <div className="workspace-meta workspace-meta--editor">
            <div className="workspace-meta__row">
              <dt>{t('document_workspace.editor_state')}</dt>
              <dd>
                {describeEditorState(
                  currentParseError,
                  isDirty,
                  t('document_workspace.editor_state_last_valid'),
                  t('document_workspace.status_dirty'),
                  t('document_workspace.status_synced'),
                )}
              </dd>
            </div>
            <div className="workspace-meta__row">
              <dt>{t('document_workspace.source_size')}</dt>
              <dd>{draftSource.length}</dd>
            </div>
            <div className="workspace-meta__row">
              <dt>{t('document_workspace.autosave_label')}</dt>
              <dd>{t('document_workspace.autosave_value')}</dd>
            </div>
            <div className="workspace-meta__row">
              <dt>{t('document_workspace.history_label')}</dt>
              <dd>
                {t('document_workspace.history_value', {
                  undo: activeSession.past.length,
                  redo: activeSession.future.length,
                })}
              </dd>
            </div>
          </div>
          {effectiveDiagnostics.length > 0 && (
            <div className="diagnostics-panel" data-testid="document-diagnostics">
              <div className="diagnostics-panel__header">
                <div>
                  <p className="diagnostics-panel__title">{t('document_workspace.diagnostics_title')}</p>
                  {activeDiagnosticLocation !== null && (
                    <p className="diagnostics-panel__meta">{activeDiagnosticLocation}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="workspace-inline-link"
                  onClick={() => void handleSaveAndBuild()}
                  disabled={authoringWritePending || documentQuery.isPending || updateDocument.isPending || buildDocument.isPending}
                  data-testid="document-diagnostics-retry"
                >
                  {t('document_workspace.retry_build')}
                </button>
              </div>
              <ul className="diagnostics-list">
                {effectiveDiagnostics.map((diagnostic, index) => (
                  <li key={`${diagnostic.code}-${String(index)}`} className="diagnostics-list__item">
                    <button
                      type="button"
                      className={
                        activeDiagnosticIndex === index || resolvedActiveDiagnosticIndex === index
                          ? 'diagnostics-list__button diagnostics-list__button--active'
                          : 'diagnostics-list__button'
                      }
                      onClick={() => focusDiagnostic(diagnostic, index)}
                      data-testid={`document-diagnostic-${String(index)}`}
                    >
                      <strong>{diagnostic.code}</strong>
                      <span>{diagnostic.message}</span>
                      {diagnostic.path !== undefined && diagnostic.path.length > 0 && (
                        <span className="diagnostics-list__path">{diagnostic.path.join(' > ')}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="workspace-panel workspace-panel--viewport">
          <div className="workspace-panel__header">
            <div>
              <p className="workspace-panel__eyebrow">{t('document_workspace.viewport_eyebrow')}</p>
              <h2 className="workspace-panel__title">
                {activeSketchModeFeature === null ? t('document_workspace.viewport_title') : 'Sketch mode'}
              </h2>
            </div>
          </div>
          <div className="viewport-frame">
            {viewportContent}
          </div>
          <div className="workspace-meta workspace-meta--viewport" data-testid="document-viewport-summary">
            <div className="workspace-meta__row">
              <dt>{t('document_workspace.viewport_source_label')}</dt>
              <dd>{viewportSourceValue}</dd>
            </div>
            <div className="workspace-meta__row">
              <dt>{t('document_workspace.viewport_status_label')}</dt>
              <dd>{buildStatusTitle}</dd>
            </div>
          </div>
        </section>
      </section>
    </WorkspaceShell>
  );
}

function clampOffset(offset: number, sourceLength: number): number {
  return Math.max(0, Math.min(offset, sourceLength));
}

function offsetToLineColumn(source: string, offset: number): { readonly line: number; readonly column: number } {
  const safeOffset = clampOffset(offset, source.length);
  const before = source.slice(0, safeOffset);
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: (lines.at(-1) ?? '').length + 1,
  };
}

function describeDiagnosticLocation(diagnostic: RuntimeDiagnostic | null, source: string): string | null {
  if (diagnostic === null || diagnostic.range === undefined) {
    return null;
  }
  const start = offsetToLineColumn(source, diagnostic.range.start);
  const end = offsetToLineColumn(source, diagnostic.range.end);
  if (start.line === end.line && start.column === end.column) {
    return `Line ${String(start.line)}, column ${String(start.column)}`;
  }
  if (start.line === end.line) {
    return `Line ${String(start.line)}, columns ${String(start.column)}-${String(end.column)}`;
  }
  return `Line ${String(start.line)}, column ${String(start.column)} to line ${String(end.line)}, column ${String(end.column)}`;
}

function resolveEffectiveDiagnostics(
  buildDiagnostics: readonly RuntimeDiagnostic[],
  streamDiagnostics: readonly RuntimeDiagnostic[] | null,
  parseDiagnostics: readonly RuntimeDiagnostic[],
): readonly RuntimeDiagnostic[] {
  if (buildDiagnostics.length > 0) {
    return buildDiagnostics;
  }
  if (streamDiagnostics !== null) {
    return streamDiagnostics;
  }
  return parseDiagnostics;
}

function describeDocumentState(
  parseError: string | null,
  isDirty: boolean,
  outOfSyncLabel: string,
  dirtyLabel: string,
  syncedLabel: string,
): string {
  if (parseError !== null) {
    return outOfSyncLabel;
  }
  if (isDirty) {
    return dirtyLabel;
  }
  return syncedLabel;
}

function describeEditorState(
  parseError: string | null,
  isDirty: boolean,
  lastValidLabel: string,
  dirtyLabel: string,
  syncedLabel: string,
): string {
  if (parseError !== null) {
    return lastValidLabel;
  }
  if (isDirty) {
    return dirtyLabel;
  }
  return syncedLabel;
}

function resolveBuildHash(build: {
  readonly documentHash: string;
  readonly tessellation: { readonly metadata: { readonly hash: string } } | null;
}): string {
  return build.tessellation?.metadata.hash ?? build.documentHash;
}
