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
import { NewProjectDialog } from '../../components/NewProjectDialog.js';
import { ProjectList } from '../../components/ProjectList.js';
import { WorkspaceShell } from '../../components/WorkspaceShell.js';

export function ProjectsIndexRoute(): React.JSX.Element {
  const { t: tProjects } = useT('projects');
  const navigate = useNavigate();
  const projectsQuery = useProjects();
  const createProject = useCreateProject();
  const [dialogOpen, setDialogOpen] = useState(false);
  const hasError = projectsQuery.isError;
  const isLoading = projectsQuery.isPending;

  const handleCreate = async (name: string): Promise<void> => {
    await createProject.mutateAsync({ name });
  };

  return (
    <WorkspaceShell
      title={tProjects('list.title')}
      description={hasError ? tProjects('states.error_body') : tProjects('list.description')}
      testId="projects-index"
      railBody={
        <dl className="workspace-meta workspace-meta--compact">
          <div className="workspace-meta__row">
            <dt>{tProjects('list.stat_label')}</dt>
            <dd>{projectsQuery.data?.items.length ?? 0}</dd>
          </div>
        </dl>
      }
      headerActions={
        <button
          type="button"
          className="workspace-button workspace-button--primary"
          onClick={() => setDialogOpen(true)}
          data-testid="project-list-create"
        >
          {tProjects('list.create_button')}
        </button>
      }
    >
      {isLoading && (
        <section className="workspace-state" data-testid="projects-index-loading">
          <p className="workspace-state__title">{tProjects('states.loading_title')}</p>
          <p className="workspace-state__body">{tProjects('states.loading_body')}</p>
        </section>
      )}
      {hasError && (
        <section className="workspace-state" data-testid="projects-index-error">
          <p className="workspace-state__title">{tProjects('states.error_title')}</p>
          <p className="workspace-state__body">{tProjects('states.error_body')}</p>
        </section>
      )}
      {!isLoading && !hasError && (
        <ProjectList
          projects={projectsQuery.data?.items ?? []}
          onCreateClick={() => setDialogOpen(true)}
          onOpenProject={(id) => navigate(`/projects/${id}`)}
          showHeader={false}
        />
      )}
      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleCreate}
      />
    </WorkspaceShell>
  );
}
