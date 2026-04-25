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
  MeSessionResponseSchema,
  UserRoleSchema,
  type LoginRequest,
  type LoginResponse,
  type LogoutResponse,
  type MeResponse,
  type MeSessionResponse,
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
  DocumentBuildEventSchema,
  DocumentBuildFailedEventSchema,
  DocumentBuildReadyEventSchema,
  DocumentBuildRunningEventSchema,
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
  type DocumentBuildEvent,
  type DocumentBuildFailedEvent,
  type DocumentBuildReadyEvent,
  type DocumentBuildRunningEvent,
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

export {
  HandbookByOpParamsSchema,
  HandbookHeadingSchema,
  HandbookKindSchema,
  HandbookListQuerySchema,
  HandbookListResponseSchema,
  HandbookLocaleSchema,
  HandbookPageParamsSchema,
  HandbookPageSchema,
  HandbookPageSummarySchema,
  HandbookSearchQuerySchema,
  HandbookSearchResponseSchema,
  type HandbookByOpParams,
  type HandbookHeading,
  type HandbookKind,
  type HandbookListQuery,
  type HandbookListResponse,
  type HandbookLocale,
  type HandbookPage,
  type HandbookPageParams,
  type HandbookPageSummary,
  type HandbookSearchQuery,
  type HandbookSearchResponse,
} from './handbook.js';
