import { assertImagesWithin } from '@criblio/app-utils/goattown';
import type { GoatTownClient } from '@criblio/app-utils/goattown';
import type { PreparedPhoto } from './image';
import { CLASSIFIER_SLUG } from './provisioning';

const CLASSIFICATION_PROMPT = 'Classify the attached photo only. Respond with HOT DOG, NOT HOT DOG, or UNCLEAR on the first line, then one short sentence describing what you see. Do not infer from the prompt or a filename.';

export async function createClassificationSession(client: GoatTownClient, signal?: AbortSignal) {
  const input = {
    agent: CLASSIFIER_SLUG,
    title: 'Hot dog photo classification',
    prompt: CLASSIFICATION_PROMPT,
  };
  return client.createSession(input, signal);
}

export async function sendClassificationPhoto(
  client: GoatTownClient,
  sessionId: string,
  photo: PreparedPhoto,
  signal?: AbortSignal,
): Promise<void> {
  const limits = await client.imageLimits(signal);
  assertImagesWithin([photo.image], limits);
  // image_input_unavailable is fatal and is surfaced by the caller; never retry as text.
  await client.sendImageMessage(
    sessionId,
    'Classify the attached photo. Do not use its filename or the prompt to guess.',
    [photo.image],
    signal,
  );
}

