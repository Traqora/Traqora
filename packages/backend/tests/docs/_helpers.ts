/**
 * Shared helpers for repository documentation content tests.
 * Each test stays small: load a file, check required text, resolve local links.
 */

import fs from 'fs';
import path from 'path';

export const REPO_ROOT = path.resolve(__dirname, '../../../..');

export function repoPath(relativePath: string): string {
  return path.join(REPO_ROOT, relativePath);
}

export function readRepoFile(relativePath: string): string {
  return fs.readFileSync(repoPath(relativePath), 'utf8');
}

/** Extract inline Markdown link destinations, ignoring titles and reference links. */
export function markdownLinks(markdown: string): string[] {
  const links: string[] = [];
  const pattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of markdown.matchAll(pattern)) {
    links.push(match[1]);
  }
  return links;
}

/** Resolve every local link target in a Markdown file to an absolute path. */
export function localMarkdownTargets(docRelativePath: string): string[] {
  const markdown = readRepoFile(docRelativePath);
  const docDir = path.dirname(repoPath(docRelativePath));

  return markdownLinks(markdown)
    .filter((link) => !/^(?:https?:|mailto:|data:|#)/i.test(link))
    .map((link) => link.split('#')[0])
    .filter((target): target is string => Boolean(target))
    .map((target) => path.resolve(docDir, target));
}

/** Return local link targets that do not exist, reported relative to the repo root. */
export function missingLocalLinkTargets(docRelativePath: string): string[] {
  return localMarkdownTargets(docRelativePath)
    .filter((target) => !fs.existsSync(target))
    .map((target) => path.relative(REPO_ROOT, target));
}

/** Return the required strings that do not appear in the supplied text. */
export function missingText(text: string, required: readonly string[]): string[] {
  return required.filter((needle) => !text.includes(needle));
}
