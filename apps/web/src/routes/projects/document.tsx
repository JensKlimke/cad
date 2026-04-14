/**
 * /projects/:id/documents/:docId route.
 *
 * Slice 1 stub: mounts the existing Slice 0 `<Viewport />` with
 * the default box. A future slice will fetch the document by id,
 * compile its `tsSource` via `@cad/sdk`, and feed the resulting
 * geometry into the kernel worker. For now, this route exists so
 * the lifecycle journey (login → create project → create document
 * → viewport renders) has a destination.
 */

import { useParams } from 'react-router';

import { Viewport } from '../../viewport/Viewport.js';

import type { BoxInput } from '@cad/kernel';

const DEFAULT_BOX: BoxInput = { width: 10, depth: 20, height: 30 };

export function DocumentHostRoute(): React.JSX.Element {
  const { id, docId } = useParams<{ id: string; docId: string }>();

  if (id === undefined || docId === undefined) {
    return <div>404</div>;
  }

  return <Viewport box={DEFAULT_BOX} />;
}
