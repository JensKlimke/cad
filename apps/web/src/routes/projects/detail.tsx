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
import { useNavigate, useParams } from 'react-router';

import { apiFetch } from '../../api/client.js';
import {
  projectQueryKey,
  useDeleteProject,
  useProject,
  useUpdateProject,
} from '../../api/projects.js';
import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog.js';
import { RenameProjectDialog } from '../../components/RenameProjectDialog.js';

const PAGE_STYLE: React.CSSProperties = {
  padding: 24,
};

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 24,
};

const DOC_LINK_STYLE: React.CSSProperties = {
  display: 'inline-block',
  padding: '8px 12px',
  marginRight: 8,
  background: '#161922',
  color: '#e6e8ec',
  borderRadius: 4,
  textDecoration: 'none',
};

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
        body: CreateDocumentRequestSchema.parse({ name: t('document.placeholder_name') }),
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

  const project = projectQuery.data;

  return (
    <main style={PAGE_STYLE} data-testid="project-detail">
      <header style={HEADER_STYLE}>
        <h1 style={{ margin: 0, flex: 1 }}>{project?.name ?? '…'}</h1>
        <button
          type="button"
          onClick={() => setRenameOpen(true)}
          data-testid="project-detail-rename"
        >
          {t('rename_dialog.title')}
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          data-testid="project-detail-delete"
        >
          {t('delete_dialog.title')}
        </button>
      </header>
      <h2>{t('detail.documents_title')}</h2>
      <button
        type="button"
        onClick={() => void createDocument.mutateAsync()}
        data-testid="project-detail-new-document"
      >
        {t('detail.new_document')}
      </button>
      <div style={{ marginTop: 16 }}>
        {(documentsQuery.data?.items ?? []).map((doc) => (
          <a
            key={doc.id}
            href={`/projects/${id}/documents/${doc.id}`}
            style={DOC_LINK_STYLE}
            data-testid={`document-link-${doc.id}`}
            onClick={(event) => {
              event.preventDefault();
              navigate(`/projects/${id}/documents/${doc.id}`);
            }}
          >
            {doc.name}
          </a>
        ))}
      </div>

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
    </main>
  );
}
