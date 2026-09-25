import { assertProposalOmitsProducer, openReviewPage, readProposalScope, readProposalStatus, stageProposal } from '@criblio/app-utils/goattown';
import type { GoatTownClient, ProposalStatus, StagedProposal } from '@criblio/app-utils/goattown';
import { configurationYaml } from './configuration.generated';

export const CLASSIFIER_SLUG = 'hot-dog-classifier';

export async function stageClassifier(client: GoatTownClient, serviceBaseUrl: string): Promise<StagedProposal> {
  const scope = await readProposalScope(client);
  if (!scope) throw new Error('This GoatTown connection cannot stage app configurations.');
  assertProposalOmitsProducer(configurationYaml);
  const proposal = await stageProposal(client, configurationYaml, scope);
  openReviewPage(serviceBaseUrl, proposal.reviewPath);
  return proposal;
}

export async function checkClassifier(client: GoatTownClient, stagedRevisionId: string | null): Promise<ProposalStatus> {
  return readProposalStatus(client, stagedRevisionId, CLASSIFIER_SLUG);
}
