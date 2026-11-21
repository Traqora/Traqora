/**
 * Lightweight i18n framework for Traqora client.
 */

import { useState, useEffect } from 'react';

export const en = {
  'wallet.status': 'Wallet Status',
  'wallet.disconnected': 'Not Connected',
  'wallet.connected': 'Connected',
  'wallet.connect': 'Connect Wallet',
  'wallet.connecting': 'Connecting...',
  'wallet.linking': 'Linking...',
  'wallet.description': 'Connect your Stellar wallet to get started.',
  'wallet.info.title': 'Wallet Information',
  'wallet.info.description': 'Your connected Stellar wallet details.',
  'wallet.address': 'Address',
  'wallet.network': 'Network',
  'wallet.type': 'Wallet Type',
  'wallet.copy': 'Copy Address',
  'wallet.copied': 'Copied!',
  'wallet.explorer': 'View on Explorer',
  'wallet.disconnect': 'Disconnect Wallet',
};

export type TranslationKeys = keyof typeof en;

const dictionaries: Record<string, Record<string, string>> = {
  en,
};

let currentLocale = 'en';

export function setLocale(locale: string) {
  if (dictionaries[locale]) {
    currentLocale = locale;
  }
}

export function getLocale(): string {
  return currentLocale;
}

export function t(key: TranslationKeys, params?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale] || dictionaries.en;
  let text = dict[key] || dictionaries.en[key] || key;
  if (params) {
    for (const [pKey, pVal] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${pKey}\\}`, 'g'), String(pVal));
    }
  }
  return text;
}

export function useTranslation() {
  const [locale, setLocState] = useState(currentLocale);

  useEffect(() => {
    setLocState(currentLocale);
  }, []);

  return {
    t,
    locale,
    setLocale: (l: string) => {
      setLocale(l);
      setLocState(l);
    },
  };
}
