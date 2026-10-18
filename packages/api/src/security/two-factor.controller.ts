// /me/2fa: state and email codes. All routes work before the second factor is passed, since
// they are how it gets passed. Authenticator apps (TOTP) use Supabase MFA on the client.
import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, type OkRes, type TwoFactorState } from '@chalk/schema';
import { AllowWithoutMfa, AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { TwoFactorService } from './two-factor.service';
import { RateLimit } from '../core/rate-limit';

@Controller('me/2fa')
@UseGuards(AuthGuard)
@AllowWithoutMfa()
export class TwoFactorController {
  constructor(private twoFactor: TwoFactorService) {}

  @Get()
  state(@CurrentUser() u: AuthUser): TwoFactorState {
    return this.twoFactor.state(u);
  }

  @Post('email/send')
  @HttpCode(202)
  async send(@CurrentUser() u: AuthUser, @Body(new ZodPipe(Api.emailCodeSend)) b: z.infer<typeof Api.emailCodeSend>): Promise<OkRes> {
    await this.twoFactor.send(u, b.purpose);
    return { ok: true };
  }

  @Post('email/verify')
  @RateLimit('otp-verify', 10, 60000)
  @HttpCode(200)
  verify(@CurrentUser() u: AuthUser, @Body(new ZodPipe(Api.emailCodeVerify)) b: z.infer<typeof Api.emailCodeVerify>): Promise<TwoFactorState> {
    return this.twoFactor.verify(u, b.purpose, b.code);
  }
}
