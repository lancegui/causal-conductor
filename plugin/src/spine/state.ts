import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fingerprintContractText, normalizeContractText } from './fingerprint';
import type { SpineState } from './types';

export function createSpineState(): SpineState {
  return { verified: false };
}

export function canWrite(state: SpineState): boolean {
  return state.contract !== undefined;
}

export function canFinish(state: SpineState): boolean {
  return state.contract !== undefined && state.verified;
}

export function approveContract(
  state: SpineState,
  text: string,
  now = Date.now(),
): SpineState {
  const normalizedText = normalizeContractText(text);

  return {
    ...state,
    contract: {
      text: normalizedText,
      fingerprint: fingerprintContractText(normalizedText),
      approvedAt: now,
    },
    verified: false,
  };
}

export function markVerified(state: SpineState): SpineState {
  if (!state.contract) {
    return state;
  }

  return {
    ...state,
    verified: true,
  };
}

export function resetSpineState(): SpineState {
  return createSpineState();
}

export interface SpineStateStoreOptions {
  // When set, approved-contract state is persisted under this directory (one
  // JSON file per session) and re-hydrated on construction, so an OpenCode
  // restart or plugin reload does not silently drop an approved contract and
  // force the user to re-approve. When unset, the store is in-memory only.
  dir?: string;
}

export class SpineStateStore {
  private readonly states = new Map<string, SpineState>();
  private readonly dir?: string;

  constructor(options: SpineStateStoreOptions = {}) {
    this.dir = options.dir;
    if (this.dir) {
      try {
        mkdirSync(this.dir, { recursive: true });
      } catch {
        // If the directory can't be created, fall back to in-memory only.
        this.dir = undefined;
      }
    }
  }

  private fileFor(sessionID: string): string {
    // session IDs are alphanumeric/_/-, but sanitize defensively.
    const safe = sessionID.replace(/[^A-Za-z0-9._-]/g, '_');
    return join(this.dir as string, `${safe}.json`);
  }

  private load(sessionID: string): SpineState | undefined {
    if (!this.dir) {
      return undefined;
    }
    try {
      const raw = readFileSync(this.fileFor(sessionID), 'utf8');
      const parsed = JSON.parse(raw) as SpineState;
      // Minimal shape validation; anything off → treat as no state.
      if (parsed && typeof parsed.verified === 'boolean') {
        return parsed;
      }
    } catch {
      // Missing or corrupt file → no persisted state.
    }
    return undefined;
  }

  private persist(sessionID: string, state: SpineState): void {
    if (!this.dir) {
      return;
    }
    try {
      writeFileSync(this.fileFor(sessionID), JSON.stringify(state));
    } catch {
      // Best-effort: a failed write must never break a tool call.
    }
  }

  private removeFile(sessionID: string): void {
    if (!this.dir) {
      return;
    }
    try {
      rmSync(this.fileFor(sessionID), { force: true });
    } catch {
      // ignore
    }
  }

  get(sessionID: string): SpineState {
    const existing = this.states.get(sessionID);
    if (existing) {
      return existing;
    }

    const state = this.load(sessionID) ?? createSpineState();
    this.states.set(sessionID, state);
    return state;
  }

  approve(sessionID: string, text: string, now = Date.now()): SpineState {
    const state = approveContract(this.get(sessionID), text, now);
    this.states.set(sessionID, state);
    this.persist(sessionID, state);
    return state;
  }

  markVerified(sessionID: string): SpineState {
    const state = markVerified(this.get(sessionID));
    this.states.set(sessionID, state);
    this.persist(sessionID, state);
    return state;
  }

  reset(sessionID: string): SpineState {
    const state = resetSpineState();
    this.states.set(sessionID, state);
    this.removeFile(sessionID);
    return state;
  }

  delete(sessionID: string): void {
    this.states.delete(sessionID);
    this.removeFile(sessionID);
  }

  canWrite(sessionID: string): boolean {
    return canWrite(this.get(sessionID));
  }

  canFinish(sessionID: string): boolean {
    return canFinish(this.get(sessionID));
  }
}
