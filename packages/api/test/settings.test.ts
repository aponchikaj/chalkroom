import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '@chalk/schema';
import { settingsFromRow, settingsPatchToRow } from '../src/accounts/settings';

describe('settings mapping', () => {
  it('uses the defaults when the user never saved settings', () => {
    expect(settingsFromRow(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('reads a row (numeric comes back as a string from Postgres)', () => {
    expect(settingsFromRow({
      tutor_voice: false, voice_rate: '1.25', captions: true, reduced_motion: true, theme: 'dark', language: 'ka', email_notifications: false,
    })).toEqual({ tutorVoice: false, voiceRate: 1.25, captions: true, reducedMotion: true, theme: 'dark', language: 'ka', emailNotifications: false });
  });

  it('writes only the fields in the patch', () => {
    expect(settingsPatchToRow({ theme: 'light', voiceRate: 0.75 })).toEqual({ theme: 'light', voice_rate: 0.75 });
  });
});
