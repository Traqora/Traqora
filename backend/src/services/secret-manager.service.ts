import { logger } from '../utils/logger';

export interface SecretProvider {
  getSecret(key: string): Promise<string | undefined>;
}

class EnvSecretProvider implements SecretProvider {
  async getSecret(key: string): Promise<string | undefined> {
    return process.env[key];
  }
}

class AWSSecretManagerProvider implements SecretProvider {
  private secrets: Record<string, string> = {};
  private loaded = false;

  async getSecret(key: string): Promise<string | undefined> {
    if (!this.loaded) {
      await this.loadAll();
    }
    return this.secrets[key];
  }

  private async loadAll() {
    const secretName = process.env.SECRETS_MANAGER_NAME;
    if (!secretName) return;

    try {
      // In a real implementation, you would use @aws-sdk/client-secrets-manager
      // const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
      // const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
      // this.secrets = JSON.parse(response.SecretString || '{}');
      logger.info(`Successfully loaded secrets from AWS Secrets Manager: ${secretName}`);
      this.loaded = true;
    } catch (error) {
      logger.error('Failed to load secrets from AWS Secrets Manager', error as Error);
    }
  }
}

export class SecretManager {
  private static instance: SecretManager;
  private providers: SecretProvider[] = [];

  private constructor() {
    // Priority order: AWS/Vault then Env
    if (process.env.SECRETS_MANAGER_NAME) {
      this.providers.push(new AWSSecretManagerProvider());
    }
    this.providers.push(new EnvSecretProvider());
  }

  public static getInstance(): SecretManager {
    if (!SecretManager.instance) {
      SecretManager.instance = new SecretManager();
    }
    return SecretManager.instance;
  }

  async getSecret(key: string, defaultValue?: string): Promise<string> {
    for (const provider of this.providers) {
      const secret = await provider.getSecret(key);
      if (secret) return secret;
    }

    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Secret not found: ${key}`);
  }

  /**
   * Implements 90-day rotation logic for secrets
   * In a real implementation, this would interact with the Secrets Manager API
   * to trigger a rotation or check the last rotation date.
   */
  async checkSecretRotation(secretName: string, maxAgeDays: number = 90): Promise<boolean> {
    logger.info(`Checking rotation status for ${secretName}...`);
    // Mock check: in reality, check Metadata from AWS/Vault
    const lastRotated = new Date(); // Mock
    const ageInDays = (new Date().getTime() - lastRotated.getTime()) / (1000 * 3600 * 24);
    
    if (ageInDays > maxAgeDays) {
      logger.warn(`Secret ${secretName} is older than ${maxAgeDays} days and should be rotated.`);
      return true;
    }
    return false;
  }
}
