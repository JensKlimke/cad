/**
 * /projects/:id route.
 *
 * Project detail page. Slice 1 lists documents and exposes
 * rename + delete dialogs for the project itself plus a "new
 * document" button. Documents that already exist link to the
 * viewport host route. All UI strings route through
 * `useT('projects')` per the Slice 0b i18n contract.
 */

import { useT } from '@cad/i18n';
import {
  CreateDocumentRequestSchema,
  DocumentSchema,
  ListDocumentsResponseSchema,
} from '@cad/protocol';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';

import { apiFetch } from '../../api/client.js';
import {
  projectQueryKey,
  useDeleteProject,
  useProject,
  useUpdateProject,
} from '../../api/projects.js';
import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog.js';
import { RenameProjectDialog } from '../../components/RenameProjectDialog.js';
import { WorkspaceShell } from '../../components/WorkspaceShell.js';
import { DEFAULT_DOCUMENT_SOURCE } from '../../documents/defaultSource.js';

export function ProjectDetailRoute(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { t } = useT('projects');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const projectQuery = useProject(id);
  const renameProject = useUpdateProject(id ?? '');
  const deleteProject = useDeleteProject();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const documentsQuery = useQuery({
    queryKey: ['projects', id, 'documents'],
    queryFn: async () => {
      if (id === undefined) throw new Error('project id missing');
      return apiFetch(`/projects/${id}/documents`, {
        schema: ListDocumentsResponseSchema,
        query: { limit: 50 },
      });
    },
    enabled: id !== undefined,
  });

  const createDocument = useMutation({
    mutationFn: async () => {
      if (id === undefined) throw new Error('project id missing');
      return apiFetch(`/projects/${id}/documents`, {
        method: 'POST',
        body: CreateDocumentRequestSchema.parse({
          name: t('document.placeholder_name'),
          tsSource: DEFAULT_DOCUMENT_SOURCE,
        }),
        schema: DocumentSchema,
      });
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['projects', id, 'documents'] });
      navigate(`/projects/${id}/documents/${created.id}`);
    },
  });

  if (id === undefined) {
    return <div>404</div>;
  }

  if (deleteProject.isSuccess) {
    return <Navigate to="/projects" replace />;
  }

  const project = projectQuery.data;
  const documents = documentsQuery.data?.items ?? [];
  const isLoading = projectQuery.isPending || documentsQuery.isPending;
  const hasError = projectQuery.isError || documentsQuery.isError;

  return (
    <WorkspaceShell
      title={project?.name ?? '…'}
      description={hasError ? t('detail.error_body') : t('detail.description')}
      projectLink={{ id, name: project?.name ?? '…' }}
      testId="project-detail"
      railBody={
        <dl className="workspace-meta workspace-meta--compact">
          <div className="workspace-meta__row">
            <dt>{t('detail.summary_documents')}</dt>
            <dd>{documents.length}</dd>
          </div>
          <div className="workspace-meta__row">
            <dt>{t('detail.summary_status')}</dt>
            <dd>{t('detail.summary_status_value')}</dd>
          </div>
        </dl>
      }
      headerActions={
        <div className="workspace-inline-actions">
          <button
            type="button"
            className="workspace-button workspace-button--primary"
            onClick={() => void createDocument.mutateAsync()}
            data-testid="project-detail-new-document"
          >
            {t('detail.new_document')}
          </button>
          <button
            type="button"
            className="workspace-button workspace-button--ghost"
            onClick={() => setRenameOpen(true)}
            data-testid="project-detail-rename"
          >
            {t('rename_dialog.title')}
          </button>
          <button
            type="button"
            className="workspace-button workspace-button--danger"
            onClick={() => setDeleteOpen(true)}
            data-testid="project-detail-delete"
          >
            {t('delete_dialog.title')}
          </button>
        </div>
      }
    >
      <section className="workspace-panel workspace-panel--documents">
        <div className="workspace-panel__header">
          <div>
            <p className="workspace-panel__eyebrow">{t('detail.documents_eyebrow')}</p>
            <h3 className="workspace-panel__title">{t('detail.documents_title')}</h3>
          </div>
        </div>
        <div className="document-list">
          {isLoading && (
            <div
              className="workspace-state workspace-state--panel"
              data-testid="project-detail-loading"
            >
              <p className="workspace-state__title">{t('states.loading_title')}</p>
              <p className="workspace-state__body">{t('states.loading_body')}</p>
            </div>
          )}
          {hasError && (
            <div
              className="workspace-state workspace-state--panel"
              data-testid="project-detail-error"
            >
              <p className="workspace-state__title">{t('states.error_title')}</p>
              <p className="workspace-state__body">{t('detail.error_body')}</p>
            </div>
          )}
          {!isLoading &&
            !hasError &&
            documents.map((doc, index) => (
              <a
                key={doc.id}
                href={`/projects/${id}/documents/${doc.id}`}
                className="document-row"
                data-testid={`document-link-${doc.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(`/projects/${id}/documents/${doc.id}`);
                }}
              >
                <div className="document-row__index">{String(index + 1).padStart(2, '0')}</div>
                <div className="document-row__content">
                  <strong className="document-row__title">{doc.name}</strong>
                  <span className="document-row__meta">{t('detail.document_ready')}</span>
                </div>
                <span className="document-row__action">{t('detail.open_document')}</span>
              </a>
            ))}
          {!isLoading && !hasError && documents.length === 0 && (
            <div className="workspace-empty workspace-empty--dense">
              <p className="workspace-empty__title">{t('detail.documents_empty_title')}</p>
              <p className="workspace-empty__body">{t('detail.documents_empty_body')}</p>
            </div>
          )}
        </div>
      </section>

      <RenameProjectDialog
        open={renameOpen}
        currentName={project?.name ?? ''}
        onClose={() => setRenameOpen(false)}
        onSubmit={async (name) => {
          await renameProject.mutateAsync({ name });
          await queryClient.invalidateQueries({ queryKey: projectQueryKey(id) });
        }}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        resourceName={project?.name ?? ''}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await deleteProject.mutateAsync(id);
          navigate('/projects', { replace: true });
        }}
      />
    </WorkspaceShell>
  );
}
