// The second-factor rule, the same as mfa_satisfied() in the database: a user who turned on a
// second factor must pass it in this session (aal2 from an authenticator app, or an email code).
export interface MfaFacts {
  aal: 'aal1' | 'aal2';
  /** a verified authenticator app (TOTP) factor exists */
  totpVerified: boolean;
  /** email codes are turned on */
  email2fa: boolean;
  /** this session verified an email code */
  sessionPassedEmail: boolean;
}

export const mfaPassed = (f: MfaFacts) => f.aal === 'aal2' || (!f.totpVerified && !f.email2fa) || f.sessionPassedEmail;
