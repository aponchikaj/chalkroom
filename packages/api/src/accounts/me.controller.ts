// The signed-in user's own account.
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { MeRes } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ProfilesService } from './profiles.service';

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private profiles: ProfilesService) {}

  @Get()
  me(@CurrentUser() u: AuthUser): Promise<MeRes> {
    return this.profiles.me(u);
  }
}
