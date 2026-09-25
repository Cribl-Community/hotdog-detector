import { observeSession } from '@criblio/app-utils/goattown';
import type { GoatTownClient } from '@criblio/app-utils/goattown';
import type { LoopEvent } from '@criblio/app-utils/agent-loop';
import type { FoldState } from './wire';
import { answerFromEntries } from './verdict';

export interface ObservationOutcome {
  status: string;
  completeByAnswer: boolean;
  timedOut: boolean;
  reason: string;
}

/** Shared observer owns the serialized polling, Retry-After, cursor and dedupe. */
export async function observeClassification(
  client: GoatTownClient,
  sessionId: string,
  getFold: () => FoldState,
  onEvent: (event: LoopEvent, seq: number) => void,
  onStatus: (status: string) => void,
  signal?: AbortSignal,
): Promise<ObservationOutcome> {
  const controller = new AbortController();
  let timedOut = false;
  let completeByAnswer = false;
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
  try {
    const result = await observeSession(client, sessionId, {
      intervalMs: 900,
      signal: controller.signal,
      onStatus: (status) => onStatus(status),
      onEvent: (event, seq) => {
        onEvent(event, seq);
        const entries = getFold().entries;
        const pendingTool = entries.some((entry) => entry.kind === 'toolCall' && (entry.status === 'running' || entry.status === 'pending'));
        if ((event.kind === 'assistantDone' || event.kind === 'toolResult') && !pendingTool && answerFromEntries(entries)) {
          completeByAnswer = true;
          // An answer event can end a soft-idle session; idle alone never does.
          controller.abort();
        }
      },
      onError: () => undefined,
    });
    return {
      status: result.status,
      completeByAnswer,
      timedOut,
      reason: timedOut ? 'The session exceeded the 60 second observation limit.' : result.reason,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
