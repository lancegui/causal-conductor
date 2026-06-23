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

export class SpineStateStore {
  private readonly states = new Map<string, SpineState>();

  get(sessionID: string): SpineState {
    const existing = this.states.get(sessionID);
    if (existing) {
      return existing;
    }

    const state = createSpineState();
    this.states.set(sessionID, state);
    return state;
  }

  approve(sessionID: string, text: string, now = Date.now()): SpineState {
    const state = approveContract(this.get(sessionID), text, now);
    this.states.set(sessionID, state);
    return state;
  }

  markVerified(sessionID: string): SpineState {
    const state = markVerified(this.get(sessionID));
    this.states.set(sessionID, state);
    return state;
  }

  reset(sessionID: string): SpineState {
    const state = resetSpineState();
    this.states.set(sessionID, state);
    return state;
  }

  delete(sessionID: string): void {
    this.states.delete(sessionID);
  }

  canWrite(sessionID: string): boolean {
    return canWrite(this.get(sessionID));
  }

  canFinish(sessionID: string): boolean {
    return canFinish(this.get(sessionID));
  }
}
