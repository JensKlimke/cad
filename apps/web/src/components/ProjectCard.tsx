/**
 * Project card — name + creation date + open button.
 */

import { useT } from '@cad/i18n';

import type { Project } from '@cad/protocol';

const CARD_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 16,
  background: '#161922',
  color: '#e6e8ec',
  borderRadius: 6,
};

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
    <article style={CARD_STYLE} data-testid={`project-card-${project.id}`}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{project.name}</h2>
      <p style={{ margin: 0, fontSize: 12, color: '#a0a4ad' }}>
        {t('card.created_at', { date: formatted })}
      </p>
      <button
        type="button"
        onClick={() => onOpen(project.id)}
        data-testid={`project-card-open-${project.id}`}
      >
        {t('card.open')}
      </button>
    </article>
  );
}
