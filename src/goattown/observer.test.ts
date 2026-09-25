import { describe, expect, it, vi } from 'vitest';
import { applyLoopEvent } from '@criblio/app-utils/investigator';
import type { GoatTownClient } from '@criblio/app-utils/goattown';
import { readEventCollection } from '@criblio/app-utils/goattown';
import { observeClassification } from './observer';
import { answerFromEntries, parseVerdict } from './verdict';
import { emptyFold } from './wire';
import type { FoldState } from './wire';

const payload = {
  status: 'idle',
  events: [
    { seq: 1, ev: { kind: 'userMessage', turnId: 'turn-0', content: 'Classify the attached image', imageCount: 1 } },
    { seq: 2, ev: { kind: 'assistantText', turnId: 'turn-0', chunk: 'NOT HOT DOG\nThe photo shows a dachshund, not a hot dog.' } },
    { seq: 3, ev: { kind: 'assistantDone', turnId: 'turn-0' } },
  ],
};

describe('classification observer', () => {
  it('folds the idle response and completes in one poll when the answer turn is done', async () => {
    const frames = readEventCollection(payload)!;
    const status = vi.fn(async () => ({ status: 'idle' as const, latestSeq: 3, frames, execution: null, carriedEvents: true }));
    const client = { status } as unknown as GoatTownClient;
    let fold: FoldState = emptyFold();
    const outcome = await observeClassification(client, 'session-1', () => fold, (event) => {
      fold = { ...fold, entries: applyLoopEvent(fold.entries, event) };
    }, () => undefined);
    expect(status).toHaveBeenCalledTimes(1);
    expect(outcome.completeByAnswer).toBe(true);
    expect(outcome.status).toBe('idle');
    expect(parseVerdict(answerFromEntries(fold.entries))).toMatchObject({ label: 'not-hot-dog', reason: 'The photo shows a dachshund, not a hot dog.' });
  });
});
