/**
 * REST controller for WebUI authentication: first-run initialization, password
 * or API key sign-in, and JWT logout.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-codes';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { ApiErrorResponseDto } from '../common/dto/api-responses.dto';
import { AuthService, type AccountState } from './auth.service';
import { AccountError, PASSWORD_POLICY } from './password';
import {
  AuthStatusResponseDto,
  LoginRequestDto,
  LoginResponseDto,
  SetupRequestDto,
} from './dto/auth.dto';
import { Public } from './public.decorator';

function getRequestId(request: FastifyRequest): string | undefined {
  const id = (request as unknown as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Reports whether first-run initialization is still required. */
  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Read WebUI authentication state' })
  @ApiOkResponse({ type: AuthStatusResponseDto })
  status(): AuthStatusResponseDto {
    const state: AccountState = this.authService.accountState();
    // The account name is deliberately absent: this endpoint is anonymous, and
    // publishing the login name hands an attacker half of the credential pair.
    return {
      initialized: state.initialized,
      apiKeyEnabled: state.apiKeyEnabled,
      passwordPolicy: PASSWORD_POLICY,
    };
  }

  /** Creates the WebUI account; only valid while none exists. */
  @Public()
  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initialize the WebUI account' })
  @ApiBody({ type: SetupRequestDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async setup(
    @Body() body: SetupRequestDto,
    @Req() request: FastifyRequest,
  ): Promise<LoginResponseDto> {
    try {
      const account = await this.authService.createAccount(
        body?.username,
        body?.password,
      );
      this.authService.logAuthEvent('log', {
        authType: 'setup',
        reason: 'loginSuccess',
        requestId: getRequestId(request),
      });
      return this.authService.signJwt(`user:${account.username}`, account.username);
    } catch (error) {
      if (error instanceof AccountError) {
        throw error.code === 'alreadyInitialized'
          ? BusinessException.conflict(
              ErrorCode.auth.alreadyInitialized,
              error.message,
            )
          : BusinessException.badRequest(
              error.code === 'usernameInvalid'
                ? ErrorCode.auth.usernameInvalid
                : ErrorCode.auth.passwordWeak,
              error.message,
            );
      }
      throw error;
    }
  }

  /** Exchanges an account password or the deployment API key for a JWT. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with a WebUI account or the API key' })
  @ApiBody({ type: LoginRequestDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async login(
    @Body() body: LoginRequestDto,
    @Req() request: FastifyRequest,
  ): Promise<LoginResponseDto> {
    const requestId = getRequestId(request);
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const client = request.ip ?? 'unknown';

    const reject = (identity: string, authType: 'passwordLogin' | 'apiKeyLogin') => {
      this.authService.registerLoginFailure(identity, client);
      const retryAfter = this.authService.loginRetryAfterSeconds(identity, client);
      this.authService.logAuthEvent('warn', {
        authType,
        reason: retryAfter > 0 ? 'rateLimited' : 'invalidCredentials',
        requestId,
      });
      if (retryAfter > 0) {
        throw BusinessException.tooManyRequests(
          ErrorCode.auth.rateLimited,
          'Too many failed sign-in attempts; try again later',
        );
      }
      throw BusinessException.unauthorized(
        ErrorCode.auth.invalidCredentials,
        authType === 'apiKeyLogin' ? 'Invalid API key' : 'Invalid username or password',
      );
    };

    /** Turns an already-throttled caller away without extending the window. */
    const assertNotThrottled = (identity: string) => {
      if (this.authService.loginRetryAfterSeconds(identity, client) > 0) {
        this.authService.logAuthEvent('warn', {
          authType: identity.endsWith('|apiKey') ? 'apiKeyLogin' : 'passwordLogin',
          reason: 'rateLimited',
          requestId,
        });
        throw BusinessException.tooManyRequests(
          ErrorCode.auth.rateLimited,
          'Too many failed sign-in attempts; try again later',
        );
      }
    };

    if (username && typeof body?.password === 'string') {
      const identity = `${client}|${username.toLowerCase()}`;
      assertNotThrottled(identity);
      // Bounded before hashing so an oversized body cannot buy scrypt work.
      if (body.password.length > PASSWORD_POLICY.passwordMax) {
        return reject(identity, 'passwordLogin');
      }
      if (!(await this.authService.verifyPassword(username, body.password))) {
        return reject(identity, 'passwordLogin');
      }

      this.authService.clearLoginFailures(identity, client);
      const account = this.authService.accountState().account;
      this.authService.logAuthEvent('log', {
        authType: 'passwordLogin',
        reason: 'loginSuccess',
        requestId,
      });
      return this.authService.signJwt(
        `user:${account?.username ?? username}`,
        account?.username ?? username,
      );
    }

    if (typeof body?.apiKey === 'string' && body.apiKey) {
      const identity = `${client}|apiKey`;
      assertNotThrottled(identity);
      if (!this.authService.validateApiKey(body.apiKey)) {
        return reject(identity, 'apiKeyLogin');
      }

      this.authService.clearLoginFailures(identity, client);
      this.authService.logAuthEvent('log', {
        authType: 'apiKeyLogin',
        reason: 'loginSuccess',
        requestId,
      });
      return this.authService.signJwt();
    }

    throw BusinessException.badRequest(
      ErrorCode.auth.credentialsRequired,
      'Provide a username and password, or the WebUI API key',
    );
  }

  /** Stateless logout; the browser clears the stored JWT. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout the current WebUI session' })
  @ApiNoContentResponse()
  logout(): void {}
}
