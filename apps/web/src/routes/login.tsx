/**
 * /login route.
 *
 * Renders `<LoginForm />`. If the user is already authenticated,
 * redirects to `/projects` (or to `?next=...` if set). Reads
 * `?next=` to bounce back to the originally requested URL after a
 * successful login.
 */

import { useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';

import { useAuth } from '../auth/AuthContext.js';
import { LoginForm } from '../components/LoginForm.js';

export function LoginRoute(): React.JSX.Element {
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
    return <div data-testid="login-loading">…</div>;
  }
  if (auth.me !== null && auth.me !== undefined) {
    return <Navigate to={next} replace />;
  }

  return <LoginForm onSuccess={() => navigate(next, { replace: true })} />;
}
