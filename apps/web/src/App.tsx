/**
 * App entry — React Router v7 data router.
 *
 * The router is built once at module scope so the test suite can
 * import it without re-instantiating per render. `main.tsx` mounts
 * it inside `<I18nProvider>` and `<QueryClientProvider>`.
 */

import { Navigate, RouterProvider, createBrowserRouter } from 'react-router';

import { RequireAuth } from './auth/RequireAuth.js';
import { LoginRoute } from './routes/login.js';
import { ProjectDetailRoute } from './routes/projects/detail.js';
import { DocumentHostRoute } from './routes/projects/document.js';
import { ProjectsIndexRoute } from './routes/projects/index.js';
import { RootLayout } from './routes/root.js';

const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: 'login', Component: LoginRoute },
      {
        path: 'projects',
        element: (
          <RequireAuth>
            <ProjectsIndexRoute />
          </RequireAuth>
        ),
      },
      {
        path: 'projects/:id',
        element: (
          <RequireAuth>
            <ProjectDetailRoute />
          </RequireAuth>
        ),
      },
      {
        path: 'projects/:id/documents/:docId',
        element: (
          <RequireAuth>
            <DocumentHostRoute />
          </RequireAuth>
        ),
      },
    ],
  },
]);

export function App(): React.JSX.Element {
  return <RouterProvider router={router} />;
}
