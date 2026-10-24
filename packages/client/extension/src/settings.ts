import { DEFAULT_SETTINGS, type ExtensionSettings } from './types';

const STORAGE_KEY = 'traqora:settings';

/**
 * Coerces whatever is in storage into a complete settings object.
 *
 * Storage contents survive extension upgrades, so a value written by an older
 * version may be missing keys or hold the wrong type; every field falls back
 * to its default rather than trusting the stored shape.
 */
export function normalizeSettings(raw: unknown): ExtensionSettings {
  const source = (raw ?? {}) as Partial<Record<keyof ExtensionSettings, unknown>>;

  const apiBaseUrl =
    typeof source.apiBaseUrl === 'string' && source.apiBaseUrl.trim()
      ? source.apiBaseUrl.trim()
      : DEFAULT_SETTINGS.apiBaseUrl;

  const minDropPercentRaw = Number(source.minDropPercent);
  const minDropPercent =
    Number.isFinite(minDropPercentRaw) && minDropPercentRaw >= 0 && minDropPercentRaw <= 100
      ? minDropPercentRaw
      : DEFAULT_SETTINGS.minDropPercent;

  return {
    apiBaseUrl,
    authToken: typeof source.authToken === 'string' ? source.authToken : '',
    notificationsEnabled:
      typeof source.notificationsEnabled === 'boolean'
        ? source.notificationsEnabled
        : DEFAULT_SETTINGS.notificationsEnabled,
    minDropPercent,
    autoDetect:
      typeof source.autoDetect === 'boolean'
        ? source.autoDetect
        : DEFAULT_SETTINGS.autoDetect,
  };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeSettings(stored?.[STORAGE_KEY]);
}

export async function saveSettings(
  settings: ExtensionSettings,
): Promise<ExtensionSettings> {
  const normalized = normalizeSettings(settings);
  await chrome.storage.sync.set({ [STORAGE_KEY]: normalized });
  return normalized;
}

export { STORAGE_KEY };
