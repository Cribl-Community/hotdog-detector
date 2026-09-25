import { applyLoopEvent } from '@criblio/app-utils/investigator';
import type { InvestigatorTranscriptEntry } from '@criblio/app-utils/investigator';
import type { LoopEvent } from '@criblio/app-utils/agent-loop';
import { readEventCollection, wireEventToLoopEvent } from '@criblio/app-utils/goattown';

export interface SequencedEvent {
  seq: number;
  ev: Record<string, unknown> & { kind: string };
}

export interface FoldState {
  entries: InvestigatorTranscriptEntry[];
  seenSeqs: Set<number>;
  rawFrames: SequencedEvent[];
  unknownKinds: number;
}

export const emptyFold = (): FoldState => ({ entries: [], seenSeqs: new Set(), rawFrames: [], unknownKinds: 0 });

function normalizeKnownEvent(raw: Record<string, unknown> & { kind: string }, entries: InvestigatorTranscriptEntry[]): LoopEvent | null {
  if (raw.kind === 'userMessage') return null;
  let event = raw;
  if (raw.kind === 'toolCall' && !raw.call) {
    const callId = typeof raw.id === 'string' ? raw.id : '';
    const fn = raw.function && typeof raw.function === 'object' ? raw.function as Record<string, unknown> : {};
    event = {
      ...raw,
      call: { id: callId, type: 'function', function: { name: String(fn.name ?? ''), arguments: String(fn.arguments ?? '') } },
      needsApproval: false,
    };
  }
  if (raw.kind === 'toolResult' && !raw.result) {
    const pending = [...entries].reverse().find((entry) => entry.kind === 'toolCall' && entry.status !== 'done' && entry.status !== 'error');
    event = {
      ...raw,
      result: {
        id: typeof raw.id === 'string' && raw.id ? raw.id : pending?.kind === 'toolCall' ? pending.call.id : '',
        name: String(raw.name ?? ''),
        content: String(raw.content ?? ''),
      },
    };
  }
  return wireEventToLoopEvent(event as Parameters<typeof wireEventToLoopEvent>[0]);
}

export function foldFrames(state: FoldState, frames: SequencedEvent[]): FoldState {
  const next: FoldState = { ...state, seenSeqs: new Set(state.seenSeqs), rawFrames: [...state.rawFrames] };
  for (const frame of [...frames].sort((a, b) => a.seq - b.seq)) {
    if (next.seenSeqs.has(frame.seq)) continue;
    next.seenSeqs.add(frame.seq);
    next.rawFrames.push(frame);
    const event = normalizeKnownEvent(frame.ev, next.entries);
    if (event) next.entries = applyLoopEvent(next.entries, event);
    else if (frame.ev.kind !== 'userMessage') next.unknownKinds += 1;
  }
  return next;
}

export function foldPayload(state: FoldState, payload: unknown): FoldState {
  const frames = readEventCollection(payload) ?? [];
  return foldFrames(state, frames as SequencedEvent[]);
}
