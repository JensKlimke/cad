/**
 * /projects/:id/documents/:docId route.
 *
 * Real Slice 2 work surface: fetches the persisted document source,
 * lets the user edit and save it, builds through the server runtime,
 * and renders the returned tessellation in the viewport shell.
 */

import { useT } from '@cad/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router';

import { ApiClientError } from '../../api/client.js';
import {
  buildToTessellation,
  diagnosticsFromError,
  useBuildDocument,
  useDocument,
  useUpdateDocument,
} from '../../api/documents.js';
import { useProject } from '../../api/projects.js';
import {
  DocumentSourceEditor,
  type DocumentSourceEditorHandle,
} from '../../components/DocumentSourceEditor.js';
import { WorkspaceShell } from '../../components/WorkspaceShell.js';
import { DEFAULT_DOCUMENT_SOURCE } from '../../documents/defaultSource.js';
import { Viewport } from '../../viewport/Viewport.js';

import type { RuntimeDiagnostic } from '@cad/protocol';

export function DocumentHostRoute(): React.JSX.Element {
  const { t } = useT('projects');
  const { id, docId } = useParams<{ id: string; docId: string }>();
  const navigate = useNavigate();
  const projectQuery = useProject(id);
  const documentQuery = useDocument(docId);
  const updateDocument = useUpdateDocument(docId ?? '');
  const buildDocument = useBuildDocument(docId ?? '');
  const editorReference = useRef<DocumentSourceEditorHandle | null>(null);
  const [draftState, setDraftState] = useState<{ readonly docId: string | null; readonly value: string | null }>({
    docId: null,
    value: null,
  });
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
  const draftSource = draftState.docId === docId ? (draftState.value ?? savedSource) : savedSource;
  const isDirty = document !== undefined && draftSource !== savedSource;
  const activeBuild = buildDocument.data?.documentId === docId ? buildDocument.data : undefined;
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

  useEffect(() => {
    if (
      !hasRouteParams ||
      documentQuery.data === undefined ||
      buildDocument.isPending ||
      activeBuild !== undefined
    ) {
      return;
    }
    if (updateDocument.isPending) {
      return;
    }
    if (documentQuery.data.tsSource.length === 0) {
      void updateDocument
        .mutateAsync({ tsSource: DEFAULT_DOCUMENT_SOURCE })
        .then(() => buildDocument.mutateAsync())
        .then((build) => {
          setBuildFeedback({
            docId: docId ?? null,
            status: 'ready',
            diagnostics: [],
            message: t('document_workspace.build_ready', {
              hash: build.build.tessellation.metadata.hash.slice(0, 12),
            }),
            hash: build.build.tessellation.metadata.hash,
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
            hash: build.build.tessellation.metadata.hash.slice(0, 12),
          }),
          hash: build.build.tessellation.metadata.hash,
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
          hash: build.build.tessellation.metadata.hash.slice(0, 12),
        }),
        hash: build.build.tessellation.metadata.hash,
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
  if (buildDocument.isPending) {
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
      if (isDirty) {
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

  const resolvedActiveDiagnosticIndex =
    buildDiagnostics.length === 0 ? null : Math.min(activeDiagnosticIndex ?? 0, buildDiagnostics.length - 1);
  const activeDiagnostic =
    resolvedActiveDiagnosticIndex === null ? null : (buildDiagnostics[resolvedActiveDiagnosticIndex] ?? null);
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

  let railBody: React.JSX.Element;
  if (documentQuery.isPending || projectQuery.isPending) {
    railBody = (
      <div className="workspace-state workspace-state--panel" data-testid="document-loading">
        <p className="workspace-state__title">{t('states.loading_title')}</p>
        <p className="workspace-state__body">{t('document_workspace.loading_body')}</p>
      </div>
    );
  } else if (documentQuery.isError || projectQuery.isError) {
    railBody = (
      <div className="workspace-state workspace-state--panel" data-testid="document-error">
        <p className="workspace-state__title">{t('states.error_title')}</p>
        <p className="workspace-state__body">{t('document_workspace.error_body')}</p>
      </div>
    );
  } else {
    railBody = (
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
            <dd>{isDirty ? t('document_workspace.status_dirty') : t('document_workspace.status_synced')}</dd>
          </div>
        </dl>
        <div className="document-note">
          <p className="document-note__title">{t('document_workspace.build_note_title')}</p>
          <p className="document-note__body">
            {activeBuildMessage ?? t('document_workspace.build_note_body')}
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
                <dd>{activeBuild.build.tessellation.metadata.hash.slice(0, 12)}</dd>
              </div>
              <div className="workspace-meta__row">
                <dt>{t('document_workspace.triangles_label')}</dt>
                <dd>{activeBuild.build.tessellation.metadata.triangleCount}</dd>
              </div>
              <div className="workspace-meta__row">
                <dt>{t('document_workspace.vertices_label')}</dt>
                <dd>{activeBuild.build.tessellation.metadata.vertexCount}</dd>
              </div>
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
            className="workspace-button workspace-button--secondary"
            onClick={() => navigate(`/projects/${id}`)}
          >
            {t('detail.back_to_projects')}
          </button>
          <button
            type="button"
            className="workspace-button workspace-button--ghost"
            onClick={() => void handleSave()}
            disabled={updateDocument.isPending || buildDocument.isPending || !isDirty}
            data-testid="document-save"
          >
            {t('document_workspace.save')}
          </button>
          <button
            type="button"
            className="workspace-button workspace-button--primary"
            onClick={() => void handleSaveAndBuild()}
            disabled={documentQuery.isPending || updateDocument.isPending || buildDocument.isPending}
            data-testid="document-build"
          >
            {buildButtonLabel}
          </button>
        </div>
      }
    >
      <section className="document-workspace-grid">
          <section className="workspace-panel workspace-panel--editor">
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
                    disabled={updateDocument.isPending || buildDocument.isPending}
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
                {activeBuildHash !== null && (
                  <p className="workspace-status__meta">
                    {t('document_workspace.hash_label')} {activeBuildHash.slice(0, 12)}
                  </p>
                )}
                {activeBuildStatus === 'error' && (
                  <button
                    type="button"
                    className="workspace-inline-link"
                    onClick={() => void handleSaveAndBuild()}
                    disabled={documentQuery.isPending || updateDocument.isPending || buildDocument.isPending}
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
              diagnostics={buildDiagnostics}
              activeDiagnosticIndex={resolvedActiveDiagnosticIndex}
              onChange={(nextValue) => setDraftState({ docId, value: nextValue })}
            />
            <div className="workspace-meta workspace-meta--editor">
              <div className="workspace-meta__row">
                <dt>{t('document_workspace.editor_state')}</dt>
                <dd>{isDirty ? t('document_workspace.status_dirty') : t('document_workspace.status_synced')}</dd>
              </div>
              <div className="workspace-meta__row">
                <dt>{t('document_workspace.source_size')}</dt>
                <dd>{draftSource.length}</dd>
              </div>
              <div className="workspace-meta__row">
                <dt>{t('document_workspace.autosave_label')}</dt>
                <dd>{t('document_workspace.autosave_value')}</dd>
              </div>
            </div>
            {buildDiagnostics.length > 0 && (
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
                    disabled={documentQuery.isPending || updateDocument.isPending || buildDocument.isPending}
                    data-testid="document-diagnostics-retry"
                  >
                    {t('document_workspace.retry_build')}
                  </button>
                </div>
                <ul className="diagnostics-list">
                  {buildDiagnostics.map((diagnostic, index) => (
                    <li key={`${diagnostic.code}-${String(index)}`} className="diagnostics-list__item">
                      <button
                        type="button"
                        className={
                          activeDiagnosticIndex === index
                            || resolvedActiveDiagnosticIndex === index
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
                <h2 className="workspace-panel__title">{t('document_workspace.viewport_title')}</h2>
              </div>
            </div>
            <div className="viewport-frame">
              {tessellation === null ? (
                <div className="workspace-state workspace-state--panel" data-testid="document-viewport-empty">
                  <p className="workspace-state__title">{viewportTitle}</p>
                  <p className="workspace-state__body">{viewportBody}</p>
                </div>
              ) : (
                <Viewport tessellation={tessellation} />
              )}
            </div>
            <div className="workspace-meta workspace-meta--viewport" data-testid="document-viewport-summary">
              <div className="workspace-meta__row">
                <dt>{t('document_workspace.viewport_source_label')}</dt>
                <dd>
                  {isDirty
                    ? t('document_workspace.viewport_source_dirty')
                    : t('document_workspace.viewport_source_saved')}
                </dd>
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
