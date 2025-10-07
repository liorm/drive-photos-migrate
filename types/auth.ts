export interface GoogleAuthContext {
  readonly accessToken: string;
  readonly refreshToken: string;

  // Rotate the contained access token obtained from accessToken using the refreshToken
  refresh: () => Promise<void>;
}

// Utility type guard (optional use)
export function isGoogleAuthContext(obj: unknown): obj is GoogleAuthContext {
  return (
    !!obj &&
    typeof obj === 'object' &&
    'accessToken' in obj &&
    typeof (obj as { accessToken: unknown }).accessToken === 'string' &&
    'refreshToken' in obj &&
    typeof (obj as { refreshToken: unknown }).refreshToken === 'string'
  );
}
