/**
 * /login route.
 *
 * Renders `<LoginForm />`. If the user is already authenticated,
 * redirects to `/projects` (or to `?next=...` if set). Reads
 * `?next=` to bounce back to the originally requested URL after a
 * successful login.
 */

import { useT } from '@cad/i18n';
import { useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';

import { useAuth } from '../auth/AuthContext.js';
import { LoginForm } from '../components/LoginForm.js';

export function LoginRoute(): React.JSX.Element {
  const { t } = useT('auth');
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') ?? '/projects';

  useEffect(() => {
    if (auth.me !== null && auth.me !== undefined) {
      navigate(next, { replace: true });
    }
  }, [auth.me, navigate, next]);

  if (auth.isLoading) {
    return (
      <main className="auth-shell auth-shell--loading" data-testid="login-loading">
        <div className="auth-shell__backdrop" />
        <div className="auth-shell__grid">
          <section className="auth-hero">
            <div className="auth-hero__badge">{t('login.stack_hint')}</div>
            <h1 className="auth-hero__title">{t('login.hero_title')}</h1>
            <p className="auth-hero__body">{t('login.hero_body')}</p>
          </section>
          <section className="auth-card auth-card--loading" aria-hidden="true">
            <div className="auth-card__skeleton auth-card__skeleton--short" />
            <div className="auth-card__skeleton" />
            <div className="auth-card__skeleton" />
            <div className="auth-card__skeleton auth-card__skeleton--button" />
          </section>
        </div>
      </main>
    );
  }
  if (auth.me !== null && auth.me !== undefined) {
    return <Navigate to={next} replace />;
  }

  return (
    <main className="auth-shell">
      <div className="auth-shell__backdrop" />
      <div className="auth-shell__grid">
        <section className="auth-hero">
          <div className="auth-hero__badge">{t('login.stack_hint')}</div>
          <p className="auth-hero__eyebrow">{t('login.eyebrow')}</p>
          <h1 className="auth-hero__title">{t('login.hero_title')}</h1>
          <p className="auth-hero__body">{t('login.hero_body')}</p>
          <ul className="auth-hero__features" aria-hidden="true">
            <li>{t('login.feature_projects')}</li>
            <li>{t('login.feature_runtime')}</li>
            <li>{t('login.feature_storage')}</li>
          </ul>
        </section>
        <LoginForm onSuccess={() => navigate(next, { replace: true })} />
      </div>
    </main>
  );
}
