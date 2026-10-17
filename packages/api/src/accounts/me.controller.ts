// The signed-in user's own account: profile, settings, profile picture, deletion.
import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, type AvatarUploadRes, type MeRes, type ProfileRow, type UserSettings } from '@chalk/schema';
import { AllowWithoutMfa, AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { ProfilesService } from './profiles.service';
import { AvatarsService } from './avatars.service';
import { RateLimit } from '../core/rate-limit';

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private profiles: ProfilesService, private avatars: AvatarsService) {}

  /** allowed before the second factor: the web needs it to show the 2FA step */
  @Get()
  @AllowWithoutMfa()
  me(@CurrentUser() u: AuthUser): Promise<MeRes> {
    return this.profiles.me(u);
  }

  @Patch()
  update(@CurrentUser() u: AuthUser, @Body(new ZodPipe(Api.updateProfile)) b: z.infer<typeof Api.updateProfile>): Promise<ProfileRow> {
    return this.profiles.update(u.id, b);
  }

  @Delete()
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser): Promise<void> {
    return this.profiles.deleteAccount(u.id);
  }

  @Get('settings')
  settings(@CurrentUser() u: AuthUser): Promise<UserSettings> {
    return this.profiles.settings(u.id);
  }

  @Patch('settings')
  updateSettings(@CurrentUser() u: AuthUser, @Body(new ZodPipe(Api.updateSettings)) b: z.infer<typeof Api.updateSettings>): Promise<UserSettings> {
    return this.profiles.updateSettings(u.id, b);
  }

  @Post('avatar/upload-url')
  @RateLimit('avatar-upload', 20, 3600000)
  avatarUploadUrl(@CurrentUser() u: AuthUser, @Body(new ZodPipe(Api.avatarUploadUrl)) b: z.infer<typeof Api.avatarUploadUrl>): Promise<AvatarUploadRes> {
    return this.avatars.uploadUrl(u.id, b.contentType);
  }

  @Post('avatar')
  @HttpCode(200)
  async avatarCommit(@CurrentUser() u: AuthUser, @Body(new ZodPipe(Api.avatarCommit)) b: z.infer<typeof Api.avatarCommit>): Promise<MeRes> {
    await this.avatars.commit(u.id, b.path);
    return this.profiles.me(u);
  }

  @Delete('avatar')
  @HttpCode(204)
  avatarClear(@CurrentUser() u: AuthUser): Promise<void> {
    return this.avatars.clear(u.id);
  }
}
