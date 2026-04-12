import { Viewport } from './viewport/Viewport.js';

import type { BoxInput } from '@cad/kernel';

const DEFAULT_BOX: BoxInput = { width: 10, depth: 20, height: 30 };

export function App(): React.JSX.Element {
  return <Viewport box={DEFAULT_BOX} />;
}
