import type { GoatTownClient } from '@criblio/app-utils/goattown';

/** Never upload the photo unless the created session resolves to a vision model. */
export async function assertVisionReady(client: GoatTownClient, sessionId: string, signal?: AbortSignal): Promise<void> {
  const llm = await client.readSessionLlm(sessionId, signal);
  if (llm.effective?.vision !== true) {
    throw new Error("This agent's model cannot see images. The photo was not sent.");
  }
}
