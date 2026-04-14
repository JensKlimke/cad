/**
 * /projects route.
 *
 * Lists every project in the current workspace and provides the
 * "new project" dialog. Wrapped in `<RequireAuth>` at the router
 * level.
 */

import { useT } from '@cad/i18n';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useCreateProject, useProjects } from '../../api/projects.js';
import { useAuth } from '../../auth/AuthContext.js';
import { NewProjectDialog } from '../../components/NewProjectDialog.js';
import { ProjectList } from '../../components/ProjectList.js';

const HEADER_BAR: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  padding: 16,
  borderBottom: '1px solid #2a2e38',
};

export function ProjectsIndexRoute(): React.JSX.Element {
  const { t } = useT('auth');
  const auth = useAuth();
  const navigate = useNavigate();
  const projectsQuery = useProjects();
  const createProject = useCreateProject();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCreate = async (name: string): Promise<void> => {
    await createProject.mutateAsync({ name });
  };

  const handleLogout = async (): Promise<void> => {
    await auth.logout();
    navigate('/login', { replace: true });
  };

  return (
    <main data-testid="projects-index">
      <div style={HEADER_BAR}>
        <button type="button" onClick={() => void handleLogout()} data-testid="logout-button">
          {t('logout')}
        </button>
      </div>
      <ProjectList
        projects={projectsQuery.data?.items ?? []}
        onCreateClick={() => setDialogOpen(true)}
        onOpenProject={(id) => navigate(`/projects/${id}`)}
      />
      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleCreate}
      />
    </main>
  );
}
