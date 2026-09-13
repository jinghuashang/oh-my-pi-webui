import { ApiProperty } from '@nestjs/swagger';

/** Login request: a WebUI account password pair, or the deployment API key. */
export class LoginRequestDto {
  @ApiProperty({ required: false, description: 'WebUI account username.' })
  username?: string;

  @ApiProperty({ required: false, description: 'WebUI account password.' })
  password?: string;

  @ApiProperty({ required: false, description: 'Deployment API key.' })
  apiKey?: string;
}

/** First-run initialization payload; accepted only while no account exists. */
export class SetupRequestDto {
  @ApiProperty({ minLength: 3, maxLength: 32 })
  username!: string;

  @ApiProperty({ minLength: 8, maxLength: 200 })
  password!: string;
}

/** Password and username bounds the server enforces, echoed for the setup form. */
export class PasswordPolicyDto {
  @ApiProperty()
  usernameMin!: number;

  @ApiProperty()
  usernameMax!: number;

  @ApiProperty()
  passwordMin!: number;

  @ApiProperty()
  passwordMax!: number;
}

/** Authentication state driving the login page's initialization branch. */
export class AuthStatusResponseDto {
  @ApiProperty({ description: 'True once a WebUI account exists.' })
  initialized!: boolean;

  @ApiProperty({ description: 'True when WEBUI_API_KEY is configured.' })
  apiKeyEnabled!: boolean;

  @ApiProperty({ type: () => PasswordPolicyDto })
  passwordPolicy!: PasswordPolicyDto;
}

/** JWT login response returned after any credential check succeeds. */
export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ description: 'Token lifetime in seconds.' })
  expiresIn!: number;
}

/** Logout response body is intentionally empty; the client clears local state. */
export class LogoutResponseDto {}
