/**
 * Route guard component.
 *
 * Redirects unauthenticated visitors to `/login`, preserving the
 * intended destination via the `?next=` query parameter so the
 * post-login redirect lands them where they meant to go. Renders a
 * loading placeholder while `useMe()` is in-flight — redirecting
 * on `pending` causes a flake where refresh briefly bounces
 * through `/login` before settling on the protected page.
 */

import { Navigate, useLocation } from 'react-router';

import { useAuth } from './AuthContext.js';

import type { ReactNode } from 'react';

export function RequireAuth({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    // Spinner placeholder. Real loading skeleton lands when the
    // app shell gets a design system in Slice 11.
    return <div data-testid="auth-loading">…</div>;
  }

  if (auth.me === null || auth.me === undefined) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}
