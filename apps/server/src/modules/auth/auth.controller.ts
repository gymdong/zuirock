import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { AuthExchangeRequest, AuthSession, AuthStartRequest, AuthStartResponse } from '@zuirock/shared';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post(':provider/start')
  @HttpCode(200)
  start(@Param('provider') provider: string, @Body() body: AuthStartRequest): Promise<AuthStartResponse> {
    return this.auth.start(provider, body);
  }

  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query() query: { code?: string; state?: string; error?: string },
    @Res() res: Response,
  ): Promise<void> {
    res.redirect(302, await this.auth.callback(provider, query));
  }

  @Post('exchange')
  @HttpCode(200)
  exchange(@Body() body: AuthExchangeRequest): Promise<AuthSession> {
    return this.auth.exchange(body);
  }
}
