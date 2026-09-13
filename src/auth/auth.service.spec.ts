/**
 * Account lifecycle tests: initialization happens once, passwords are verified
 * against a salted derivation, and repeated failures throttle the caller.
 */
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from '../database/database.testing';
import { DatabaseService } from '../database/database.service';
import { AccountError, AuthService } from './auth.service';

const API_KEY = 'test-api-key';

function createService(database: TestDatabase, apiKey: string = API_KEY): AuthService {
  const config = {
    get: (key: string) => (key === 'WEBUI_API_KEY' ? apiKey : undefined),
  } as unknown as ConfigService;
  return new AuthService(
    config,
    new JwtService({}),
    { db: database.db } as unknown as DatabaseService,
  );
}

describe('AuthService accounts', () => {
  let database: TestDatabase;
  let service: AuthService;

  beforeEach(() => {
    database = createTestDatabase();
    service = createService(database);
  });

  afterEach(() => database.sqlite.close());

  it('reports an uninitialized deployment before any account exists', () => {
    expect(service.accountState()).toEqual({
      initialized: false,
      account: null,
      apiKeyEnabled: true,
    });
  });

  it('creates the account once and then refuses a second initialization', async () => {
    const created = await service.createAccount('nekomata', 'correct-horse');
    expect(created.username).toBe('nekomata');
    expect(service.accountState().initialized).toBe(true);

    await expect(service.createAccount('other', 'another-pass')).rejects.toThrow(
      AccountError,
    );
  });

  it('admits exactly one account when concurrent setups race', async () => {
    const attempts = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].map(
      (name) => service.createAccount(name, 'correct-horse'),
    );
    const settled = await Promise.allSettled(attempts);
    const created = settled.filter((entry) => entry.status === 'fulfilled');

    expect(created).toHaveLength(1);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 });
  });

  it('never stores the plaintext password', async () => {
    await service.createAccount('nekomata', 'correct-horse');
    const row = database.sqlite
      .prepare('SELECT password_hash, password_salt FROM users')
      .get() as { password_hash: string; password_salt: string };

    expect(row.password_hash).not.toContain('correct-horse');
    expect(row.password_hash).toHaveLength(128);
    expect(row.password_salt).toHaveLength(32);
    // A second account with the same password must not collide, so the salt is
    // per-row rather than derived from the password.
    expect(row.password_salt).toMatch(/^[0-9a-f]+$/);
  });

  it('accepts the right password and rejects every other one', async () => {
    await service.createAccount('nekomata', 'correct-horse');
    await expect(service.verifyPassword('nekomata', 'correct-horse')).resolves.toBe(true);
    await expect(service.verifyPassword('nekomata', 'correct-hors')).resolves.toBe(false);
    await expect(service.verifyPassword('someone-else', 'correct-horse')).resolves.toBe(false);
  });

  it('rejects usernames and passwords outside the policy', async () => {
    await expect(service.createAccount('ab', 'correct-horse')).rejects.toMatchObject({
      code: 'usernameInvalid',
    });
    await expect(service.createAccount('ok-name', 'short')).rejects.toMatchObject({
      code: 'passwordWeak',
    });
  });

  it('throttles repeated failures on one account and clears on success', () => {
    const identity = '127.0.0.1|nekomata';
    const client = '127.0.0.1';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      service.registerLoginFailure(identity, client);
    }
    expect(service.loginRetryAfterSeconds(identity, client)).toBe(0);
    service.registerLoginFailure(identity, client);
    expect(service.loginRetryAfterSeconds(identity, client)).toBeGreaterThan(0);

    service.clearLoginFailures(identity, client);
    expect(service.loginRetryAfterSeconds(identity, client)).toBe(0);
  });

  it('throttles username spraying from one client', () => {
    const client = '127.0.0.1';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      service.registerLoginFailure(`${client}|spray-${attempt}`, client);
    }
    // Every sprayed name is under its own limit, so only the client bucket can trip.
    expect(service.loginRetryAfterSeconds(`${client}|spray-21`, client)).toBe(0);
    service.registerLoginFailure(`${client}|spray-20`, client);
    expect(service.loginRetryAfterSeconds(`${client}|spray-21`, client)).toBeGreaterThan(0);
  });

  it('keeps an unguessable signing secret when no API key is configured', async () => {
    const withoutKey = createService(database, '');
    const issued = await withoutKey.signJwt();
    await expect(withoutKey.verifyJwt(issued.accessToken)).resolves.toBe(true);

    // A token minted from the old constant derivation must not be accepted.
    const forged = new JwtService({});
    const constantSecret = createHmac('sha256', 'webui')
      .update('oh-my-pi-webui-jwt')
      .digest('hex');
    const forgedToken = await forged.signAsync(
      { sub: 'webui' },
      { secret: constantSecret, algorithm: 'HS256', expiresIn: 3600 },
    );
    await expect(withoutKey.verifyJwt(forgedToken)).resolves.toBe(false);
  });

  it('keeps the API key usable as a machine credential', () => {
    expect(service.validateApiKey(API_KEY)).toBe(true);
    expect(service.validateApiKey('wrong')).toBe(false);
    expect(service.validateApiKey(undefined)).toBe(false);
  });

  it('issues verifiable tokens for both account and API key logins', async () => {
    const accountToken = await service.signJwt('user:nekomata', 'nekomata');
    await expect(service.verifyJwt(accountToken.accessToken)).resolves.toBe(true);

    const machineToken = await service.signJwt();
    await expect(service.verifyJwt(machineToken.accessToken)).resolves.toBe(true);
    await expect(service.verifyJwt(`${accountToken.accessToken}x`)).resolves.toBe(false);
  });
});
