import { describe, expect, it } from 'vitest';
import { parseVerdict, sessionDisposition } from './verdict';

describe('verdict parsing', () => {
  it('checks the negative phrase before the positive phrase, including a one-line assistant response', () => {
    expect(parseVerdict('NOT HOT DOG\nA dachshund, not a hot dog.')).toMatchObject({ label: 'not-hot-dog', title: 'Not hot dog' });
    expect(parseVerdict('NOT HOT DOG The image shows a dog standing on grass.')).toMatchObject({ label: 'not-hot-dog', title: 'Not hot dog' });
  });
  it('accepts only a verdict on the first line and never guesses from prose', () => {
    expect(parseVerdict('HOT DOG\nA frankfurter in a bun.').label).toBe('hot-dog');
    expect(parseVerdict('UNCLEAR\nThe image is too blurry.').label).toBe('unclear');
    expect(parseVerdict('I can see something that might be a hot dog.').label).toBe('unclear');
  });
});

describe('session states', () => {
  it('keeps idle and waiting soft while recognizing terminal states', () => {
    expect(sessionDisposition('idle')).toBe('soft');
    expect(sessionDisposition('waiting')).toBe('soft');
    expect(sessionDisposition('running')).toBe('active');
    expect(sessionDisposition('complete')).toBe('terminal');
    expect(sessionDisposition('failed')).toBe('terminal');
    expect(sessionDisposition('error')).toBe('terminal');
  });
});
