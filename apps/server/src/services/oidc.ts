/**
 * OIDC adapter stub.
 *
 * Slice 1 ships a compile-only stub gated behind `OIDC_ENABLED`.
 * The factory builds an `openid-client` configuration when the
 * env says so, and returns a no-op adapter otherwise. Real IdP
 * integration (the actual login redirect dance) lands in Slice 12
 * alongside the API surface hardening.
 *
 * The stub exists today so the env contract, the
 * `OIDCAdapter` interface, and the failure modes are locked in
 * before downstream slices depend on them.
 */

import type { Env } from '../config/env.js';

export interface OidcLoginInitiation {
  /** Authorization URL the client should redirect the user to. */
  readonly authorizationUrl: string;
  /** State parameter the caller persists for CSRF protection. */
  readonly state: string;
}

export interface OidcLoginCompletion {
  /** Email returned by the IdP. */
  readonly email: string;
  /** External user id / `sub` claim. */
  readonly externalId: string;
}

export interface OidcAdapter {
  readonly enabled: boolean;
  /** Build the redirect URL for the start of a login flow. */
  beginLogin(state: string): Promise<OidcLoginInitiation>;
  /** Exchange the authorization code for the user identity. */
  completeLogin(code: string, state: string): Promise<OidcLoginCompletion>;
}

class DisabledOidcAdapter implements OidcAdapter {
  public readonly enabled = false;

  async beginLogin(): Promise<OidcLoginInitiation> {
    throw new Error('OIDC is not enabled (set OIDC_ENABLED=true)');
  }

  async completeLogin(): Promise<OidcLoginCompletion> {
    throw new Error('OIDC is not enabled (set OIDC_ENABLED=true)');
  }
}

interface OidcConfig {
  readonly discoveryUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

class StubOidcAdapter implements OidcAdapter {
  public readonly enabled = true;
  public readonly config: OidcConfig;

  constructor(config: OidcConfig) {
    this.config = config;
  }

  async beginLogin(state: string): Promise<OidcLoginInitiation> {
    // Slice 12 will:
    //   const oidcConfig = await openidClient.discovery(
    //     new URL(this.config.discoveryUrl),
    //     this.config.clientId,
    //     this.config.clientSecret,
    //   );
    //   const url = openidClient.buildAuthorizationUrl(oidcConfig, { ... });
    // For now, throw — the stub is unit-tested for the env wiring only.
    throw new Error(
      `OIDC stub: beginLogin not yet implemented (discoveryUrl=${this.config.discoveryUrl}, state=${state})`,
    );
  }

  async completeLogin(code: string, state: string): Promise<OidcLoginCompletion> {
    throw new Error(
      `OIDC stub: completeLogin not yet implemented (clientId=${this.config.clientId}, code=${code}, state=${state})`,
    );
  }
}

/**
 * Build an OIDC adapter from server env. When `OIDC_ENABLED` is
 * false, returns a no-op adapter that throws on every call.
 */
export function createOidcAdapter(env: Env): OidcAdapter {
  if (!env.OIDC_ENABLED) {
    return new DisabledOidcAdapter();
  }
  if (
    env.OIDC_DISCOVERY_URL === undefined ||
    env.OIDC_CLIENT_ID === undefined ||
    env.OIDC_CLIENT_SECRET === undefined ||
    env.OIDC_REDIRECT_URI === undefined
  ) {
    throw new Error(
      'OIDC_ENABLED is true but OIDC_DISCOVERY_URL / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET / OIDC_REDIRECT_URI are not all set',
    );
  }
  return new StubOidcAdapter({
    discoveryUrl: env.OIDC_DISCOVERY_URL,
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
    redirectUri: env.OIDC_REDIRECT_URI,
  });
}
