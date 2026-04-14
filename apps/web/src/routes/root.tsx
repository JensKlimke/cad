/**
 * Root layout route.
 *
 * Provides the AuthContext for every descendant route and renders
 * the React Router `<Outlet />` so child routes can mount inside.
 * The QueryClient lives one level higher in `main.tsx` because
 * the AuthContext consumes TanStack Query directly.
 */

import { Outlet } from 'react-router';

import { AuthProvider } from '../auth/AuthContext.js';

export function RootLayout(): React.JSX.Element {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
