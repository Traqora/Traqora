import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Utility for AES-256-GCM encryption/decryption
 */
export class EncryptionUtils {
  private readonly key: Buffer;

  constructor(encryptionKey: string) {
    if (!encryptionKey) {
      throw new Error('Encryption key is required');
    }

    // Ensure the key is 32 bytes for aes-256
    this.key = crypto.scryptSync(encryptionKey, 'traqora-salt', KEY_LENGTH);
  }

  /**
   * Encrypts a string
   * Output format: iv:tag:content (base64)
   */
  encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const tag = cipher.getAuthTag();
    
    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypts a string
   */
  decrypt(encryptedText: string): string {
    try {
      const [ivBase64, tagBase64, contentBase64] = encryptedText.split(':');
      if (!ivBase64 || !tagBase64 || !contentBase64) {
        throw new Error('Invalid encrypted text format');
      }

      const iv = Buffer.from(ivBase64, 'base64');
      const tag = Buffer.from(tagBase64, 'base64');
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(contentBase64, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      // If decryption fails, return the original text if it doesn't look encrypted
      // This helps during transition periods
      if (!encryptedText.includes(':')) {
        return encryptedText;
      }
      throw error;
    }
  }
}

// Singleton instance for use in TypeORM transformers
let instance: EncryptionUtils | null = null;

export const getEncryptionUtils = (key?: string) => {
  if (!instance) {
    const finalKey = key || process.env.ENCRYPTION_KEY;
    if (!finalKey) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    instance = new EncryptionUtils(finalKey);
  }
  return instance;
};

/**
 * TypeORM transformer for automatic encryption/decryption
 */
export const encryptionTransformer = {
  to: (value: string | null | undefined): string | null | undefined => {
    if (!value) return value;
    return getEncryptionUtils().encrypt(value);
  },
  from: (value: string | null | undefined): string | null | undefined => {
    if (!value) return value;
    return getEncryptionUtils().decrypt(value);
  },
};
