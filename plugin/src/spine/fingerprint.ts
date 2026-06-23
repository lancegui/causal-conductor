import { createHash } from 'node:crypto';

export function normalizeContractText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function fingerprintContractText(text: string): string {
  return createHash('sha256').update(normalizeContractText(text)).digest('hex');
}
