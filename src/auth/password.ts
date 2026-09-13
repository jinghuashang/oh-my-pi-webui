/**
 * Password and username policy: the single place the WebUI decides what a
 * credential may look like and how it is turned into a stored secret.
 *
 * The HTTP login path and the local password-reset CLI both call in here, so a
 * reset can never write a hash the login path would refuse to verify, and the
 * policy cannot drift between the two entry points.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/** Cost parameters for credential derivations. */
export const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
export const SALT_BYTES = 16;
export const KEY_BYTES = 64;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/** Bounds echoed by `/auth/status` so the setup form can explain them. */
export interface PasswordPolicy {
  usernameMin: number;
  usernameMax: number;
  passwordMin: number;
  passwordMax: number;
}

export const PASSWORD_POLICY: PasswordPolicy = {
  usernameMin: USERNAME_MIN,
  usernameMax: USERNAME_MAX,
  passwordMin: PASSWORD_MIN,
  passwordMax: PASSWORD_MAX,
};

/** Input rejected by the policy, carrying the reason the caller must report. */
export class AccountError extends Error {
  constructor(
    readonly code: 'alreadyInitialized' | 'usernameInvalid' | 'passwordWeak',
    message: string,
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

/** Trims and validates a login name, or rejects it with a specific reason. */
export function normalizeUsername(username: unknown): string {
  const name = typeof username === 'string' ? username.trim() : '';
  if (
    name.length < USERNAME_MIN ||
    name.length > USERNAME_MAX ||
    !USERNAME_PATTERN.test(name)
  ) {
    throw new AccountError(
      'usernameInvalid',
      `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters of letters, digits, dot, dash or underscore`,
    );
  }
  return name;
}

/** Rejects passwords that are trivially guessable or out of policy bounds. */
export function assertPasswordAcceptable(password: unknown): void {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    throw new AccountError(
      'passwordWeak',
      `Password must be at least ${PASSWORD_MIN} characters`,
    );
  }
  if (password.length > PASSWORD_MAX) {
    throw new AccountError(
      'passwordWeak',
      `Password must be at most ${PASSWORD_MAX} characters`,
    );
  }
  const distinct = new Set(password);
  if (password.length < 12 && distinct.size < 4) {
    throw new AccountError('passwordWeak', 'Password is too repetitive');
  }
}

/** Derives the stored hash and its per-account salt. */
export async function hashPassword(
  password: string,
): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await deriveKey(password, salt, KEY_BYTES);
  return { hash: derived.toString('hex'), salt: salt.toString('hex') };
}

/** Constant-time check of a candidate password against a stored hash. */
export async function verifyPasswordHash(
  password: string,
  stored: { hash: string; salt: string },
): Promise<boolean> {
  const derived = await deriveKey(password, Buffer.from(stored.salt, 'hex'), KEY_BYTES);
  const expected = Buffer.from(stored.hash, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
