export interface GoogleAuthContext {
  accessToken: string;
  refreshToken?: string;
}

// Utility type guard (optional use)
export function isGoogleAuthContext(obj: any): obj is GoogleAuthContext {
  return (
    !!obj &&
    typeof obj === 'object' &&
    typeof obj.accessToken === 'string' &&
    (obj.refreshToken === undefined || typeof obj.refreshToken === 'string')
  );
}
