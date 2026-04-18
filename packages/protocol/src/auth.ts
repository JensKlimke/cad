/**
 * Authentication request and response schemas.
 *
 * Slice 1 ships local-user login (email + password), JWT in
 * HTTP-only cookie, server-side revocation table. OIDC is a
 * compile-only stub gated on `OIDC_ENABLED`; its request shape is
 * not exposed in this slice.
 */

import { z } from 'zod';

import { EmailSchema, TimestampSchema, UlidSchema } from './common.js';

export const UserRoleSchema = z.enum(['admin', 'member']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * The login endpoint sets the session cookie as a side effect; the
 * response body carries only the user identity so the web client
 * can populate its `AuthContext` without a follow-up `/auth/me`
 * round-trip.
 */
export const LoginResponseSchema = z.object({
  userId: UlidSchema,
  email: EmailSchema,
  role: UserRoleSchema,
  workspaceId: UlidSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const LogoutResponseSchema = z.object({
  ok: z.literal(true),
});
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

export const MeResponseSchema = z.object({
  userId: UlidSchema,
  email: EmailSchema,
  role: UserRoleSchema,
  workspaceId: UlidSchema,
  createdAt: TimestampSchema,
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const MeSessionResponseSchema = MeResponseSchema.nullable();
export type MeSessionResponse = z.infer<typeof MeSessionResponseSchema>;
