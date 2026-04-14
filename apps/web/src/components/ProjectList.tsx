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
}

const LIST_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: 16,
  padding: 24,
};

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '24px 24px 0 24px',
};

const EMPTY_STYLE: React.CSSProperties = {
  padding: 48,
  textAlign: 'center',
  color: '#a0a4ad',
};

export function ProjectList({
  projects,
  onCreateClick,
  onOpenProject,
}: ProjectListProps): React.JSX.Element {
  const { t } = useT('projects');
  return (
    <section data-testid="project-list">
      <header style={HEADER_STYLE}>
        <h1 style={{ margin: 0 }}>{t('list.title')}</h1>
        <button type="button" onClick={onCreateClick} data-testid="project-list-create">
          {t('list.create_button')}
        </button>
      </header>
      {projects.length === 0 ? (
        <p style={EMPTY_STYLE} data-testid="project-list-empty">
          {t('list.empty')}
        </p>
      ) : (
        <ul style={LIST_STYLE}>
          {projects.map((project) => (
            <li key={project.id} style={{ listStyle: 'none' }}>
              <ProjectCard project={project} onOpen={onOpenProject} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
