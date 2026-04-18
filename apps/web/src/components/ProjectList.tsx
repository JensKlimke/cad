/**
 * Project list — pure presentational component.
 *
 * Receives the project array via props so it can be rendered in
 * tests without a TanStack Query provider. The route component
 * (`routes/projects/index.tsx`) wires the `useProjects()` hook and
 * passes the data down.
 */

import { useT } from '@cad/i18n';

import { ProjectCard } from './ProjectCard.js';

import type { Project } from '@cad/protocol';

export interface ProjectListProps {
  readonly projects: readonly Project[];
  readonly onCreateClick: () => void;
  readonly onOpenProject: (id: string) => void;
  readonly showHeader?: boolean;
}

export function ProjectList({
  projects,
  onCreateClick,
  onOpenProject,
  showHeader = true,
}: ProjectListProps): React.JSX.Element {
  const { t } = useT('projects');
  return (
    <section className="workspace-section" data-testid="project-list">
      {showHeader && (
        <header className="workspace-section__header">
          <div>
            <p className="workspace-section__eyebrow">{t('list.eyebrow')}</p>
            <h3 className="workspace-section__title">{t('list.title')}</h3>
          </div>
          <button
            type="button"
            className="workspace-button workspace-button--primary"
            onClick={onCreateClick}
            data-testid="project-list-create"
          >
            {t('list.create_button')}
          </button>
        </header>
      )}
      {projects.length === 0 ? (
        <div className="workspace-empty" data-testid="project-list-empty">
          <div className="workspace-empty__icon" aria-hidden="true">
            <span />
            <span />
          </div>
          <p className="workspace-empty__title">{t('list.empty_title')}</p>
          <p className="workspace-empty__body">{t('list.empty')}</p>
          <button
            type="button"
            className="workspace-button workspace-button--primary"
            onClick={onCreateClick}
          >
            {t('list.create_button')}
          </button>
        </div>
      ) : (
        <ul className="project-grid">
          {projects.map((project) => (
            <li key={project.id} className="project-grid__item">
              <ProjectCard project={project} onOpen={onOpenProject} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
