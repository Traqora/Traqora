import { loadSettings, saveSettings } from './settings';
import type { ExtensionSettings } from './types';

/** Settings page: reads the stored config into the form and writes it back. */

function input<T extends HTMLInputElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

function readForm(): ExtensionSettings {
  return {
    apiBaseUrl: input('apiBaseUrl').value.trim(),
    authToken: input('authToken').value.trim(),
    minDropPercent: Number(input('minDropPercent').value),
    notificationsEnabled: input('notificationsEnabled').checked,
    autoDetect: input('autoDetect').checked,
  };
}

function writeForm(settings: ExtensionSettings): void {
  input('apiBaseUrl').value = settings.apiBaseUrl;
  input('authToken').value = settings.authToken;
  input('minDropPercent').value = String(settings.minDropPercent);
  input('notificationsEnabled').checked = settings.notificationsEnabled;
  input('autoDetect').checked = settings.autoDetect;
}

function setStatus(message: string, kind: 'ok' | 'error'): void {
  const status = document.getElementById('status');
  if (!status) return;
  status.textContent = message;
  status.className = kind;
}

async function init(): Promise<void> {
  writeForm(await loadSettings());

  input('save').addEventListener('click', async () => {
    try {
      // `saveSettings` normalizes, so the form reflects what was actually
      // stored rather than what the user typed.
      const stored = await saveSettings(readForm());
      writeForm(stored);
      setStatus('Saved.', 'ok');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save', 'error');
    }
  });
}

if (typeof document !== 'undefined') {
  void init();
}
