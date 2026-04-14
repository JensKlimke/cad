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

const FORM_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxWidth: 320,
  margin: '64px auto',
  padding: 24,
  background: '#161922',
  color: '#e6e8ec',
  borderRadius: 8,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const ERROR_STYLE: React.CSSProperties = {
  color: '#ff6b6b',
  fontSize: 13,
};

export function LoginForm({ onSuccess }: LoginFormProps): React.JSX.Element {
  const { t } = useT('auth');
  const { t: tErrors } = useT('errors');
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <form data-testid="login-form" onSubmit={handleSubmit} style={FORM_STYLE} noValidate>
      <h1 style={{ margin: 0, fontSize: 20 }}>{t('login.title')}</h1>
      <label>
        <span>{t('login.email_label')}</span>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          data-testid="login-email"
        />
      </label>
      <label>
        <span>{t('login.password_label')}</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          data-testid="login-password"
        />
      </label>
      {error !== undefined && (
        <div role="alert" style={ERROR_STYLE} data-testid="login-error">
          {error}
        </div>
      )}
      <button type="submit" disabled={submitting} data-testid="login-submit">
        {submitting ? t('login.submitting') : t('login.submit')}
      </button>
    </form>
  );
}
