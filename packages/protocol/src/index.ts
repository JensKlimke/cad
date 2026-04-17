/**
 * Public surface of `@cad/protocol`.
 *
 * Every REST endpoint, MCP tool, and CLI command in the monorepo
 * imports its request and response shapes from this barrel. There
 * is no parallel "API types" file anywhere else.
 */

export {
  EmailSchema,
  ErrorEnvelopeSchema,
  PageParamsSchema,
  TimestampSchema,
  UlidSchema,
  type Email,
  type ErrorEnvelope,
  type PageParams,
  type Timestamp,
  type Ulid,
} from './common.js';

export {
  LoginRequestSchema,
  LoginResponseSchema,
  LogoutResponseSchema,
  MeResponseSchema,
  UserRoleSchema,
  type LoginRequest,
  type LoginResponse,
  type LogoutResponse,
  type MeResponse,
  type UserRole,
} from './auth.js';

export {
  CreateProjectRequestSchema,
  ListProjectsResponseSchema,
  ProjectSchema,
  UpdateProjectRequestSchema,
  type CreateProjectRequest,
  type ListProjectsResponse,
  type Project,
  type UpdateProjectRequest,
} from './projects.js';

export {
  ArtifactGetUrlResponseSchema,
  ArtifactPutUrlRequestSchema,
  ArtifactPutUrlResponseSchema,
  BuildDocumentFailureDetailsSchema,
  BuildDocumentResponseSchema,
  CreateDocumentRequestSchema,
  DocumentSchema,
  JsonTessellationSchema,
  ListDocumentsResponseSchema,
  ResolvedParameterSchema,
  RuntimeDiagnosticSchema,
  RuntimeFeatureResultSchema,
  UpdateDocumentRequestSchema,
  type ArtifactGetUrlResponse,
  type ArtifactPutUrlRequest,
  type ArtifactPutUrlResponse,
  type BuildDocumentFailureDetails,
  type BuildDocumentResponse,
  type CreateDocumentRequest,
  type Document,
  type JsonTessellation,
  type ListDocumentsResponse,
  type ResolvedParameter,
  type RuntimeDiagnostic,
  type RuntimeFeatureResult,
  type UpdateDocumentRequest,
} from './documents.js';
