/**
 * Canonical schema barrel. Drizzle Kit reads this file via
 * `drizzle.config.ts` to generate migrations, and the runtime
 * client wires it via `createDbClient(env)`.
 *
 * Adding a table = create the file under `schema/`, add the
 * re-export here, and run `pnpm --filter @cad/db drizzle-kit
 * generate` to emit a new migration.
 */

export { workspaces, type Workspace, type WorkspaceInsert } from './workspaces.js';
export { users, type User, type UserInsert } from './users.js';
export { projects, type Project, type ProjectInsert } from './projects.js';
export { documents, type Document, type DocumentInsert } from './documents.js';
export {
  documentVersions,
  type DocumentVersion,
  type DocumentVersionInsert,
} from './document-versions.js';
export { sessions, type Session, type SessionInsert } from './sessions.js';
