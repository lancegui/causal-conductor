// Ported from oh-my-opencode-slim (src/utils/internal-initiator.ts), trimmed to
// the two symbols the spine hook uses. Marks injected text parts as
// plugin-internal so the host can distinguish them from real assistant output.

export const SLIM_INTERNAL_INITIATOR_MARKER = '<!-- SLIM_INTERNAL_INITIATOR -->';

export function createInternalAgentTextPart(text: string): {
  type: 'text';
  text: string;
} {
  return {
    type: 'text',
    text: `${text}\n${SLIM_INTERNAL_INITIATOR_MARKER}`,
  };
}
