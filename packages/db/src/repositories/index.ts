/**
 * Repository barrel. Importing from `@cad/db` re-exports each
 * factory via the package barrel.
 */

export {
  createDocumentRepo,
  type CreateDocumentArgs,
  type DocumentRepo,
  type ListDocumentsArgs,
  type ListDocumentsResult,
  type UpdateDocumentArgs,
} from './documents.js';

export {
  createProjectRepo,
  type CreateProjectArgs,
  type ListProjectsArgs,
  type ListProjectsResult,
  type ProjectRepo,
  type UpdateProjectArgs,
} from './projects.js';

export { createSessionRepo, type RevokeSessionArgs, type SessionRepo } from './sessions.js';

export {
  createUserRepo,
  type CreateUserArgs,
  type FindUserByEmailArgs,
  type UpdatePasswordArgs,
  type UserRepo,
} from './users.js';
