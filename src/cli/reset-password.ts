#!/usr/bin/env node
/**
 * Local password recovery: writes a new credential straight into the WebUI
 * database.
 *
 * This is the documented way back in when the password is lost. It runs on the
 * machine that holds the database, needs no API access, and is the only path
 * that may create or rename the account outside the browser's first-run flow.
 *
 * Usage:
 *   node dist/cli/reset-password.js [--username <name>] [--password <value>]
 *                                   [--db <path>] [--help]
 */
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { stdin, stdout } from 'node:process';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { DatabaseService } from '../database/database.service';
import { users } from '../database/schema';
import {
  AccountError,
  assertPasswordAcceptable,
  hashPassword,
  normalizeUsername,
  PASSWORD_POLICY,
} from '../auth/password';

interface Options {
  username?: string;
  password?: string;
  db?: string;
}

const USAGE = `
Reset or create the WebUI account by writing to the database directly.

Options:
  --username <name>   Account to write (default: the existing account)
  --password <value>  New password; omit to be prompted without echo
  --db <path>         Database file (default: WEBUI_DB_PATH or WEBUI_HOME/webui.sqlite)
  --help              Show this help

The account keeps working without a restart: the login path reads the database
on every attempt.
`.trim();

function parseArgs(argv: string[]): Options & { help?: boolean } {
  const options: Options & { help?: boolean } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--username':
        options.username = argv[++index];
        break;
      case '--password':
        options.password = argv[++index];
        break;
      case '--db':
        options.db = argv[++index];
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

/**
 * Lines read from a piped stdin, buffered so a caller that asks for a second
 * line still gets it when both arrived in one chunk.
 */
const pipedLines: string[] = [];
const pipedWaiters: Array<(line: string) => void> = [];
let pipedReaderAttached = false;

function nextPipedLine(): Promise<string> {
  if (!pipedReaderAttached) {
    pipedReaderAttached = true;
    let buffer = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        const waiter = pipedWaiters.shift();
        if (waiter) waiter(line);
        else pipedLines.push(line);
        newline = buffer.indexOf('\n');
      }
    });
  }

  const queued = pipedLines.shift();
  if (queued !== undefined) return Promise.resolve(queued);
  return new Promise<string>((resolve) => {
    pipedWaiters.push(resolve);
  });
}

/**
 * Reads one credential from the terminal without echoing it.
 *
 * On a TTY the input is taken in raw mode, which is what keeps the password out
 * of the terminal echo, the scrollback and the shell history. Piped input falls
 * back to line reads so the command stays scriptable.
 */
function readSecret(prompt: string): Promise<string> {
  if (!stdin.isTTY) return nextPipedLine();

  // An executor rather than Promise.withResolvers: the build targets ES2023,
  // whose lib types do not declare withResolvers yet.
  return new Promise<string>((resolve) => {
    let value = '';
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        switch (char) {
          case '\r':
          case '\n':
            finish();
            resolve(value);
            return;
          case '\u0003': // Ctrl-C
            finish();
            process.exit(130);
            break;
          case '\u007f':
          case '\b':
            value = value.slice(0, -1);
            break;
          default:
            value += char;
        }
      }
    };

    stdin.on('data', onData);
  });
}

/** Resolves the database the same way the server does, honouring --db first. */
function createDatabase(options: Options): DatabaseService {
  const config = new ConfigService({
    ...process.env,
    ...(options.db ? { WEBUI_DB_PATH: resolve(options.db) } : {}),
  });
  // The CLI can be started from anywhere; migrations live beside the build.
  if (!config.get('WEBUI_MIGRATIONS_DIR')) {
    const besideBuild = resolve(__dirname, '..', '..', 'drizzle');
    const fromCwd = join(process.cwd(), 'drizzle');
    config.set('WEBUI_MIGRATIONS_DIR', existsSync(besideBuild) ? besideBuild : fromCwd);
  }
  return new DatabaseService(config);
}

async function main(): Promise<void> {
  let options: Options & { help?: boolean };
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    stdout.write(`${(error as Error).message}\n\n${USAGE}\n`);
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    stdout.write(`${USAGE}\n`);
    return;
  }

  let database: DatabaseService | undefined;
  try {
    database = createDatabase(options);
    const existing = database.db.select().from(users).limit(1).all()[0];

    const username = options.username
      ? normalizeUsername(options.username)
      : (existing?.username ?? '');
    if (!username) {
      stdout.write(
        'No account exists yet and no --username was given.\n' +
          'Pass --username to create one, or initialize it in the browser.\n',
      );
      process.exitCode = 1;
      return;
    }

    let password = options.password;
    if (password === undefined) {
      password = await readSecret(`New password for "${username}": `);
      const confirmation = await readSecret('Repeat the password: ');
      if (password !== confirmation) {
        stdout.write('The two entries do not match; nothing was written.\n');
        process.exitCode = 1;
        return;
      }
    }
    assertPasswordAcceptable(password);

    const { hash, salt } = await hashPassword(password);
    const now = Date.now();

    if (existing) {
      database.db
        .update(users)
        .set({
          username,
          passwordHash: hash,
          passwordSalt: salt,
          updatedAt: now,
        })
        .where(eq(users.id, existing.id))
        .run();
      stdout.write(
        `Password updated for "${username}".\n` +
          (existing.username === username
            ? ''
            : `Account renamed from "${existing.username}".\n`) +
          'Sessions issued before now stay valid until they expire.\n',
      );
    } else {
      database.db
        .insert(users)
        .values({
          username,
          passwordHash: hash,
          passwordSalt: salt,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      stdout.write(
        `Account "${username}" created.\n` +
          `Password policy: ${PASSWORD_POLICY.passwordMin}-${PASSWORD_POLICY.passwordMax} characters.\n`,
      );
    }
  } catch (error) {
    if (error instanceof AccountError) {
      stdout.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    database?.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`reset-password failed: ${String(error)}\n`);
  process.exitCode = 1;
});
