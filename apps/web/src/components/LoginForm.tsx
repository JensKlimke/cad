/**
 * Login form.
 *
 * Every label, placeholder, validation message, and submit button
 * routes through `useT('auth')` per the Slice 0b i18n contract.
 * Server failures are re-translated via the `i18nKey` field on
 * the error envelope when present, falling back to the English
 * `message` otherwise.
 */

import { useT } from '@cad/i18n';
import { useState, type FormEvent } from 'react';

import { ApiClientError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';

export interface LoginFormProps {
  /** Callback fired after a successful login. */
  readonly onSuccess?: () => void;
}

const PREFILL_LOGIN_EMAIL = import.meta.env.VITE_PREFILL_LOGIN_EMAIL ?? '';
const PREFILL_LOGIN_PASSWORD = import.meta.env.VITE_PREFILL_LOGIN_PASSWORD ?? '';

export function LoginForm({ onSuccess }: LoginFormProps): React.JSX.Element {
  const { t } = useT('auth');
  const { t: tErrors } = useT('errors');
  const { login } = useAuth();
  const [email, setEmail] = useState(PREFILL_LOGIN_EMAIL);
  const [password, setPassword] = useState(PREFILL_LOGIN_PASSWORD);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(undefined);

    if (email.trim().length === 0) {
      setError(t('login.email_required'));
      return;
    }
    if (password.length === 0) {
      setError(t('login.password_required'));
      return;
    }

    setSubmitting(true);
    try {
      await login({ email, password });
      onSuccess?.();
    } catch (error_: unknown) {
      if (error_ instanceof ApiClientError) {
        const key = error_.envelope.error.i18nKey;
        if (key !== undefined && key.startsWith('errors:')) {
          // Re-translate server-side error via the active locale.
          // i18next understands `ns:key` strings even when the
          // `t` is bound to a different namespace.
          setError(tErrors(key.slice('errors:'.length) as 'generic'));
        } else {
          setError(error_.envelope.error.message);
        }
      } else {
        setError(tErrors('generic'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-card">
      <div className="auth-card__brand">
        <div className="auth-card__mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <p className="auth-card__eyebrow">{t('login.eyebrow')}</p>
          <h2 className="auth-card__title">{t('login.title')}</h2>
        </div>
      </div>
      <p className="auth-card__subtitle">{t('login.subtitle')}</p>
      <form data-testid="login-form" onSubmit={handleSubmit} className="auth-form" noValidate>
        <label className="auth-field">
          <span className="auth-field__label">{t('login.email_label')}</span>
          <span className="auth-field__frame">
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="auth-field__input"
              data-testid="login-email"
            />
          </span>
        </label>
        <label className="auth-field">
          <span className="auth-field__label">{t('login.password_label')}</span>
          <span className="auth-field__frame">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="auth-field__input"
              data-testid="login-password"
            />
          </span>
        </label>
        {error !== undefined && (
          <div role="alert" className="auth-form__error" data-testid="login-error">
            {error}
          </div>
        )}
        <button type="submit" disabled={submitting} className="auth-form__submit" data-testid="login-submit">
          {submitting ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
      <p className="auth-card__help">{t('login.help')}</p>
    </section>
  );
}
