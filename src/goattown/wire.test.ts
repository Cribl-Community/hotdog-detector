import { describe, expect, it } from 'vitest';
import { answerFromEntries, findingReasonFromEntries, parseVerdict } from './verdict';
import { emptyFold, foldPayload } from './wire';

const payload = {
  status: 'idle',
  events: [
    { seq: 1, ev: { kind: 'userMessage', turnId: 'turn-0', content: 'Classify the attached image', imageCount: 1 } },
    { seq: 2, ev: { kind: 'assistantText', turnId: 'turn-0', chunk: 'NOT HOT DOG\nThe photo shows a dachshund, not a hot dog.' } },
    { seq: 3, ev: { kind: 'assistantDone', turnId: 'turn-0' } },
  ],
};

describe('GoatTown event wire', () => {
  it('folds the real status payload into one assistant entry and the right verdict', () => {
    const state = foldPayload(emptyFold(), payload);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({ kind: 'assistant', content: 'NOT HOT DOG\nThe photo shows a dachshund, not a hot dog.', inProgress: false });
    expect(parseVerdict(answerFromEntries(state.entries))).toMatchObject({
      label: 'not-hot-dog',
      reason: 'The photo shows a dachshund, not a hot dog.',
    });
  });

  it('deduplicates replayed sequence numbers without adding transcript entries', () => {
    const first = foldPayload(emptyFold(), payload);
    const replay = foldPayload(first, payload);
    expect(replay.entries).toEqual(first.entries);
    expect(replay.rawFrames).toHaveLength(3);
    expect(replay.seenSeqs.size).toBe(3);
  });

  it('keeps unknown event kinds visible and counts them without guessing a mapping', () => {
    const state = foldPayload(emptyFold(), { status: 'idle', events: [{ seq: 9, ev: { kind: 'futureKind', detail: 'kept raw' } }] });
    expect(state.unknownKinds).toBe(1);
    expect(state.rawFrames[0].ev).toMatchObject({ kind: 'futureKind', detail: 'kept raw' });
    expect(state.entries).toEqual([]);
  });

  it('reads verdict and evidence from the report finding tool result shown in the transcript', () => {
    const state = foldPayload(emptyFold(), { status: 'idle', events: [
      { seq: 20, ev: { kind: 'toolCall', turnId: 'turn-2', id: 'report-1', function: { name: 'report', arguments: '{}' } } },
      { seq: 21, ev: { kind: 'toolResult', turnId: 'turn-2', result: {
        id: 'report-1', name: 'report', content: '',
        ui: { kind: 'report', headline: 'HOT DOG', report: '# Investigation findings\nHOT DOG The image shows a hot dog topped with mustard.' },
      } } },
    ] });
    const conclusion = answerFromEntries(state.entries);
    expect(parseVerdict(conclusion).label).toBe('hot-dog');
    expect(findingReasonFromEntries(state.entries)).toBe('The image shows a hot dog topped with mustard.');
  });

  it('normalizes the documented flat tool result and matches it to the newest pending call', () => {
    const state = foldPayload(emptyFold(), { status: 'running', events: [
      { seq: 10, ev: { kind: 'toolCall', turnId: 'turn-1', id: 'call-1', function: { name: 'report', arguments: '{"summary":"done"}' } } },
      { seq: 11, ev: { kind: 'toolResult', turnId: 'turn-1', name: 'report', content: 'reported' } },
    ] });
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({ kind: 'toolCall', call: { id: 'call-1' }, status: 'done', result: { id: 'call-1', name: 'report', content: 'reported' } });
  });
});
