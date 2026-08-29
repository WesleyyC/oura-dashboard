export interface OuraTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  grantedScopes: string[];
}

export interface TokenContext {
  ownerId: string;
  profileId: string;
  version: number;
}

export interface EncryptedTokenRecord {
  ciphertext: string;
  nonce: string;
  encryptionVersion: number;
}
