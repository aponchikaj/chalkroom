// Public profiles: anyone signed in can look a user up by username (no email).
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { PublicProfile } from '@chalk/schema';
import { AuthGuard } from '../core/auth.guard';
import { ProfilesService } from './profiles.service';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private profiles: ProfilesService) {}

  @Get(':username')
  get(@Param('username') username: string): Promise<PublicProfile> {
    return this.profiles.publicProfile(username);
  }
}
