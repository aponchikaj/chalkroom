// Pure: user_settings rows <-> the UserSettings contract (snake_case columns, camelCase API).
import { DEFAULT_SETTINGS, type UserSettings } from '@chalk/schema';

export interface SettingsRow {
  tutor_voice: boolean;
  /** numeric(3,2): Postgres returns it as a string */
  voice_rate: number | string;
  captions: boolean;
  reduced_motion: boolean;
  theme: UserSettings['theme'];
  language: UserSettings['language'];
  email_notifications: boolean;
}

const COLUMN: Record<keyof UserSettings, keyof SettingsRow> = {
  tutorVoice: 'tutor_voice', voiceRate: 'voice_rate', captions: 'captions', reducedMotion: 'reduced_motion',
  theme: 'theme', language: 'language', emailNotifications: 'email_notifications',
};

/** Saved settings, or the defaults when the user never changed any. */
export function settingsFromRow(row: SettingsRow | null): UserSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    tutorVoice: row.tutor_voice, voiceRate: Number(row.voice_rate), captions: row.captions, reducedMotion: row.reduced_motion,
    theme: row.theme, language: row.language, emailNotifications: row.email_notifications,
  };
}

/** Columns to write for a partial update. */
export function settingsPatchToRow(patch: Partial<UserSettings>): Partial<SettingsRow> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined).map(([k, v]) => [COLUMN[k as keyof UserSettings], v]));
}
