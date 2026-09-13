/**
 * Central authentication service: WebUI accounts, deployment API key, JWT sessions.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { serverSecrets, users, type UserRow } from '../database/schema';
import {
  AccountError,
  KEY_BYTES,
  PASSWORD_POLICY,
  SCRYPT_PARAMS,
  SALT_BYTES,
  assertPasswordAcceptable,
  hashPassword,
  normalizeUsername,
  verifyPasswordHash,
} from './password';

export type AuthType = 'jwt' | 'apiKey' | 'password';

const JWT_SUBJECT = 'webui';
const JWT_TTL_SECONDS = 24 * 60 * 60;
/** Namespace for the signing secret, so it never collides with a password salt. */
const JWT_SECRET_CONTEXT = 'oh-my-pi-webui-jwt';

/** Failed sign-ins tolerated inside the window before the limiter trips. */
const LOGIN_MAX_FAILURES = 5;
/** Client-wide failures tolerated in the same window, covering username sprays. */
const CLIENT_MAX_FAILURES = 20;
/** Sliding window for the failure limiter, in milliseconds. */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export interface AuthResult {
  ok: boolean;
  authType?: AuthType;
  reason?: string;
}

export interface AccountSummary {
  username: string;
  createdAt: number;
}

export interface AccountState {
  initialized: boolean;
  account: AccountSummary | null;
  apiKeyEnabled: boolean;
}

interface WebUiJwtPayload {
  sub: string;
  name?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly apiKey: string;
  /** Lazily resolved signing secrets, computed once per process. */
  private persistedSecret: string | null = null;
  private derivedFromKey: string | null = null;
  /** Failed sign-in timestamps per client identity, pruned on every write. */
  private readonly loginFailures = new Map<string, number[]>();

  constructor(
    configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly database: DatabaseService,
  ) {
    this.apiKey = configService.get<string>('WEBUI_API_KEY')?.trim() ?? '';
  }

  /**
   * Signing secret for session tokens.
   *
   * A configured API key yields a stable derivation, so restarting the server
   * keeps sessions. Without one the secret must still be unguessable: deriving
   * it from a constant would let anyone mint tokens offline, so it comes from
   * a random value persisted on first use instead.
   */
  private get jwtSecret(): string {
    if (this.apiKey) {
      this.derivedFromKey ??= scryptSync(
        this.apiKey,
        JWT_SECRET_CONTEXT,
        KEY_BYTES,
        SCRYPT_PARAMS,
      ).toString('hex');
      return this.derivedFromKey;
    }
    if (!this.persistedSecret) {
      const existing = this.database.db
        .select()
        .from(serverSecrets)
        .where(eq(serverSecrets.name, JWT_SECRET_CONTEXT))
        .limit(1)
        .all()[0];
      if (existing) {
        this.persistedSecret = existing.value;
      } else {
        const generated = randomBytes(32).toString('hex');
        this.database.db
          .insert(serverSecrets)
          .values({ name: JWT_SECRET_CONTEXT, value: generated, createdAt: Date.now() })
          .onConflictDoNothing()
          .run();
        // A concurrent boot may have won the insert; the stored value is the
        // only one both processes can agree on, so re-read it.
        const stored = this.database.db
          .select()
          .from(serverSecrets)
          .where(eq(serverSecrets.name, JWT_SECRET_CONTEXT))
          .limit(1)
          .all()[0];
        this.persistedSecret = stored?.value ?? generated;
      }
    }
    return this.persistedSecret;
  }

  /** Reports whether an account exists and which login methods are available. */
  accountState(): AccountState {
    const row = this.database.db.select().from(users).limit(1).all()[0];
    return {
      initialized: row !== undefined,
      account: row
        ? { username: row.username, createdAt: row.createdAt }
        : null,
      apiKeyEnabled: this.apiKey.length > 0,
    };
  }

  /**
   * Creates the single WebUI account during first-run initialization.
   *
   * @param username - Login name, validated against the username policy.
   * @param password - Plaintext password, hashed before it reaches the database.
   * @throws AccountError when an account already exists or the input is invalid.
   */
  async createAccount(username: string, password: string): Promise<AccountSummary> {
    const name = normalizeUsername(username);
    assertPasswordAcceptable(password);

    const { hash, salt } = await hashPassword(password);

    // The expensive derivation happens before the check on purpose: the check
    // and the insert then run in one synchronous block, so two concurrent
    // setups cannot both observe an empty table. The unique index on the
    // singleton column is the second line of defence.
    if (this.accountState().initialized) {
      throw new AccountError(
        'alreadyInitialized',
        'The WebUI account is already initialized',
      );
    }
    const now = Date.now();
    try {
      this.database.db
        .insert(users)
        .values({
          username: name,
          passwordHash: hash,
          passwordSalt: salt,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } catch {
      throw new AccountError(
        'alreadyInitialized',
        'The WebUI account is already initialized',
      );
    }

    this.logger.log({ authType: 'setup', reason: 'accountCreated' });
    return { username: name, createdAt: now };
  }

  /**
   * Verifies a username and password pair.
   *
   * An unknown username still pays for one derivation, so a caller cannot tell
   * "no such account" from "wrong password" by timing alone.
   */
  async verifyPassword(username: unknown, password: unknown): Promise<boolean> {
    const provided = typeof password === 'string' ? password : '';
    const name = typeof username === 'string' ? username.trim() : '';
    const row = name ? this.findAccountByUsername(name) : undefined;

    // The derivation runs for every attempt, matching accounts and unknown
    // names alike: returning early would turn response time into a username
    // oracle. An unknown name still burns one derivation against a throwaway
    // salt so the two paths cost the same.
    if (!row) {
      // An unknown name still pays one derivation, so response time cannot be
      // used to tell "no such account" from "wrong password".
      await verifyPasswordHash(provided, {
        hash: randomBytes(KEY_BYTES).toString('hex'),
        salt: randomBytes(SALT_BYTES).toString('hex'),
      });
      return false;
    }
    return verifyPasswordHash(provided, { hash: row.passwordHash, salt: row.passwordSalt });
  }

  /** Looks up the single account, tolerating case differences in the login name. */
  private findAccountByUsername(username: string): UserRow | undefined {
    const exact = this.database.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1)
      .all()[0];
    if (exact) return exact;
    const only = this.database.db.select().from(users).limit(1).all()[0];
    return only && only.username.toLowerCase() === username.toLowerCase() ? only : undefined;
  }

  /** Validates a raw API key using a timing-safe comparison. */
  validateApiKey(candidate: unknown): boolean {
    if (typeof candidate !== 'string' || !candidate) return false;
    if (!this.apiKey) return false;
    return this.timingSafeCompare(candidate, this.apiKey);
  }

  /**
   * Checks both throttling buckets without recording an attempt.
   *
   * @param identity - `client|username` bucket for one account guess.
   * @param client - `client` bucket that also covers username spraying and API key guessing.
   * @returns Seconds to wait before retrying, or 0 when the caller may proceed.
   */
  loginRetryAfterSeconds(identity: string, client: string): number {
    const now = Date.now();
    const account = (this.loginFailures.get(identity) ?? []).filter(
      (at) => now - at < LOGIN_WINDOW_MS,
    );
    const global = (this.loginFailures.get(client) ?? []).filter(
      (at) => now - at < LOGIN_WINDOW_MS,
    );
    const buckets: Array<[number[], number]> = [
      [account, LOGIN_MAX_FAILURES],
      [global, CLIENT_MAX_FAILURES],
    ];
    let longest = 0;
    for (const [entries, limit] of buckets) {
      if (entries.length <= limit) continue;
      const oldest = entries[entries.length - (limit + 1)] ?? entries[0];
      longest = Math.max(longest, Math.ceil((LOGIN_WINDOW_MS - (now - oldest)) / 1000));
    }
    return longest;
  }

  /**
   * Records a failed sign-in against one account and its client.
   *
   * The client bucket is what makes guessing across many usernames, or across
   * the API key, cost something; the account bucket is the tighter limit that
   * protects a single password.
   */
  registerLoginFailure(identity: string, client: string): void {
    const now = Date.now();
    for (const key of [identity, client]) {
      const recent = (this.loginFailures.get(key) ?? []).filter(
        (at) => now - at < LOGIN_WINDOW_MS,
      );
      recent.push(now);
      this.loginFailures.set(key, recent);
    }
    if (this.loginRetryAfterSeconds(identity, client) > 0) {
      this.logger.warn({ authType: 'password', reason: 'rateLimited' });
    }
  }

  /** Clears the failure windows a successful sign-in earned. */
  clearLoginFailures(identity: string, client: string): void {
    this.loginFailures.delete(identity);
    this.loginFailures.delete(client);
  }

  /** Signs a short-lived JWT for a WebUI session. */
  async signJwt(
    subject: string = JWT_SUBJECT,
    username?: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const accessToken = await this.jwtService.signAsync(
      { sub: subject, name: username },
      {
        secret: this.jwtSecret,
        algorithm: 'HS256',
        expiresIn: JWT_TTL_SECONDS,
      },
    );

    return { accessToken, expiresIn: JWT_TTL_SECONDS };
  }

  /** Verifies a JWT and ensures it was issued for this WebUI deployment. */
  async verifyJwt(token: string): Promise<boolean> {
    try {
      const payload = await this.jwtService.verifyAsync<WebUiJwtPayload>(
        token,
        {
          secret: this.jwtSecret,
          algorithms: ['HS256'],
        },
      );
      return payload.sub === JWT_SUBJECT || payload.sub.startsWith('user:');
    } catch {
      return false;
    }
  }

  /**
   * Authenticates a bearer token. JWT is preferred; raw API key remains as a
   * machine-to-machine fallback for health checks and local tooling.
   */
  async authenticateToken(
    token: string | null | undefined,
    requestId?: string,
  ): Promise<AuthResult> {
    if (!token) return { ok: false, reason: 'missingToken' };

    if (await this.verifyJwt(token)) {
      return { ok: true, authType: 'jwt' };
    }

    if (this.looksLikeJwt(token)) {
      this.logger.warn({ authType: 'jwt', reason: 'verifyFailed', requestId });
    }

    if (this.validateApiKey(token)) {
      this.logger.log({
        authType: 'apiKey',
        reason: 'fallbackAccepted',
        requestId,
      });
      return { ok: true, authType: 'apiKey' };
    }

    return { ok: false, reason: 'invalidToken' };
  }

  /** Emits a sanitized authentication event for audit trails. */
  logAuthEvent(
    level: 'log' | 'warn',
    fields: {
      authType: AuthType | 'apiKeyLogin' | 'passwordLogin' | 'setup';
      reason: string;
      requestId?: string;
    },
  ): void {
    this.logger[level](fields);
  }

  private timingSafeCompare(candidate: string, expected: string): boolean {
    const candidateBuffer = Buffer.from(candidate);
    const expectedBuffer = Buffer.from(expected);
    if (candidateBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(candidateBuffer, expectedBuffer);
  }

  private looksLikeJwt(token: string): boolean {
    return token.split('.').length === 3;
  }
}
