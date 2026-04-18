import { useT } from '@cad/i18n';
import { NavLink, useNavigate } from 'react-router';

import { useAuth } from '../auth/AuthContext.js';

import { LanguageSwitcher } from './LanguageSwitcher.js';

import type { ReactNode } from 'react';

export interface WorkspaceShellProps {
  readonly title: string;
  readonly description: string;
  readonly projectLink?: {
    readonly id: string;
    readonly name: string;
  };
  readonly documentLink?: {
    readonly id: string;
    readonly name: string;
  };
  readonly railBody?: ReactNode;
  readonly headerActions?: ReactNode;
  readonly children: ReactNode;
  readonly testId: string;
}

export function WorkspaceShell({
  title,
  description,
  projectLink,
  documentLink,
  railBody,
  headerActions,
  children,
  testId,
}: WorkspaceShellProps): React.JSX.Element {
  const { t, i18n } = useT('projects');
  const { t: tAuth } = useT('auth');
  const auth = useAuth();
  const navigate = useNavigate();

  async function handleLogout(): Promise<void> {
    await auth.logout();
    navigate('/login', { replace: true });
  }

  return (
    <main className="app-shell" data-testid={testId}>
      <aside className="app-shell__rail">
        <div className="app-shell__brand">
          <div className="workspace-topbar__mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="app-shell__eyebrow">{t('workspace.eyebrow')}</p>
            <h1 className="app-shell__title">{t('workspace.title')}</h1>
          </div>
        </div>
        <nav className="app-shell__nav" aria-label={t('workspace.title')}>
          <NavLink
            to="/projects"
            className={({ isActive }) => (isActive && documentLink === undefined && projectLink === undefined
              ? 'app-shell__nav-link app-shell__nav-link--active'
              : 'app-shell__nav-link')}
            end
          >
            <span className="app-shell__nav-label">{t('list.title')}</span>
            <span className="app-shell__nav-meta">{t('list.eyebrow')}</span>
          </NavLink>
          {projectLink !== undefined && (
            <NavLink
              to={`/projects/${projectLink.id}`}
              className={({ isActive }) =>
                isActive && documentLink === undefined
                  ? 'app-shell__nav-link app-shell__nav-link--active'
                  : 'app-shell__nav-link'}
            >
              <span className="app-shell__nav-label">{projectLink.name}</span>
              <span className="app-shell__nav-meta">{t('detail.summary_title')}</span>
            </NavLink>
          )}
          {projectLink !== undefined && documentLink !== undefined && (
            <NavLink
              to={`/projects/${projectLink.id}/documents/${documentLink.id}`}
              className={({ isActive }) =>
                isActive ? 'app-shell__nav-link app-shell__nav-link--active' : 'app-shell__nav-link'}
            >
              <span className="app-shell__nav-label">{documentLink.name}</span>
              <span className="app-shell__nav-meta">{t('document_workspace.editor_title')}</span>
            </NavLink>
          )}
        </nav>
        <section className="app-shell__context">
          <div className="app-shell__context-header">
            <p className="app-shell__eyebrow">{title}</p>
            <p className="app-shell__context-body">{description}</p>
          </div>
          {railBody}
        </section>
        <footer className="app-shell__footer">
          <div className="app-shell__identity">
            <span className="app-shell__identity-label">{t('workspace.eyebrow')}</span>
            <strong className="app-shell__identity-value">{auth.me?.email ?? '…'}</strong>
          </div>
          <div className="app-shell__footer-actions">
            <div className="app-shell__locale">
              <LanguageSwitcher i18n={i18n} />
            </div>
            <button
              type="button"
              className="workspace-button workspace-button--ghost app-shell__logout"
              onClick={() => void handleLogout()}
              data-testid="logout-button"
            >
              {tAuth('logout')}
            </button>
          </div>
        </footer>
      </aside>
      <div className="app-shell__content">
        <header className="app-shell__header">
          <div>
            <p className="app-shell__eyebrow">{t('workspace.eyebrow')}</p>
            <h2 className="app-shell__content-title">{title}</h2>
            <p className="app-shell__content-body">{description}</p>
          </div>
          {headerActions !== undefined && <div className="app-shell__header-actions">{headerActions}</div>}
        </header>
        <div className="app-shell__main">{children}</div>
      </div>
    </main>
  );
}
