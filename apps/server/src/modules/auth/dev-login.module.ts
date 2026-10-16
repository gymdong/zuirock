import { Body, Controller, HttpCode, Logger, Module, Post, type DynamicModule } from '@nestjs/common';
import type { AuthSession, MeDto } from '@zuirock/shared';
import { badRequest } from '../../common/api-error.js';
import { PrismaService } from '../../common/prisma.service.js';
import { TokensService } from '../../common/tokens.service.js';
import { UsersModule } from '../users/users.module.js';
import { UsersService } from '../users/users.service.js';

export interface DevLoginRequest {
  nickname: string;
  isAdmin?: boolean;
}

/** Dev login exists only with DEV_LOGIN=1 outside production; otherwise the route is never registered. */
export function devLoginEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEV_LOGIN === '1' && env.NODE_ENV !== 'production';
}

@Controller('auth')
class DevLoginController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly users: UsersService,
  ) {}

  /** POST /api/auth/dev-login — creates or reuses a user by nickname; same body as /auth/exchange. */
  @Post('dev-login')
  @HttpCode(200)
  async login(@Body() body: DevLoginRequest): Promise<AuthSession> {
    const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
    const check = await this.users.nicknameAvailable(nickname);
    if (!nickname || check.reason === 'TOO_LONG' || check.reason === 'EMPTY') throw badRequest('BAD_NICKNAME', '닉네임은 1~10자예요');
    const user = await this.prisma.user.upsert({
      where: { nickname },
      create: { nickname, isAdmin: body.isAdmin === true },
      update: body.isAdmin === undefined ? {} : { isAdmin: body.isAdmin === true },
    });
    const { token, expiresAt } = this.tokens.signMember(user.id);
    const me: MeDto = await this.users.me(user.id);
    return { accessToken: token, expiresAt: expiresAt.toISOString(), user: me };
  }
}

@Module({})
export class DevLoginModule {
  static forRoot(env: NodeJS.ProcessEnv = process.env): DynamicModule {
    if (!devLoginEnabled(env)) return { module: DevLoginModule };
    Logger.warn('DEV_LOGIN=1: POST /api/auth/dev-login is enabled (development only)', 'Auth');
    return { module: DevLoginModule, imports: [UsersModule], controllers: [DevLoginController] };
  }
}
