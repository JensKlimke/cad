import { useT } from '@cad/i18n';

import type { Project } from '@cad/protocol';

/**
 * Project card — name + creation date + open button.
 */

export interface ProjectCardProps {
  readonly project: Project;
  readonly onOpen: (id: string) => void;
}

export function ProjectCard({ project, onOpen }: ProjectCardProps): React.JSX.Element {
  const { t, i18n } = useT('projects');
  const formatted = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
    new Date(project.createdAt),
  );
  return (
    <article className="project-card" data-testid={`project-card-${project.id}`}>
      <div className="project-card__accent" aria-hidden="true" />
      <p className="project-card__eyebrow">{t('card.label')}</p>
      <h4 className="project-card__title">{project.name}</h4>
      <p className="project-card__meta">{t('card.created_at', { date: formatted })}</p>
      <div className="project-card__footer">
        <button
          type="button"
          className="workspace-button workspace-button--secondary"
          onClick={() => onOpen(project.id)}
          data-testid={`project-card-open-${project.id}`}
        >
          {t('card.open')}
        </button>
      </div>
    </article>
  );
}
