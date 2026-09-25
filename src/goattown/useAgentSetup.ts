import { useCallback, useEffect, useState } from 'react';
import type { GoatTownClient, ProposalStatus, StagedProposal } from '@criblio/app-utils/goattown';
import { readKv, setupKey, writeKv } from './history';
import { checkClassifier, stageClassifier } from './provisioning';
import type { ServiceKey } from './transport';

interface SetupState {
  checked: boolean;
  status: ProposalStatus | null;
  staged: StagedProposal | null;
  error: string | null;
  busy: boolean;
}

export function useAgentSetup(client: GoatTownClient, service: ServiceKey, userId: string, active: boolean) {
  const [state, setState] = useState<SetupState>({ checked: false, status: null, staged: null, error: null, busy: false });
  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const savedProposal = await readKv<StagedProposal>(setupKey(userId, service));
      const status = await checkClassifier(client, savedProposal?.revisionId ?? null);
      setState((current) => ({ ...current, checked: true, busy: false, status, staged: savedProposal }));
      return status;
    } catch (error) {
      setState((current) => ({ ...current, checked: true, busy: false, error: error instanceof Error ? error.message : String(error) }));
      return null;
    }
  }, [client, service, userId]);

  useEffect(() => {
    if (active && userId) void refresh();
  }, [active, userId, refresh]);

  const stage = useCallback(async () => {
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const proposal = await stageClassifier(client, client.baseUrl);
      await writeKv(setupKey(userId, service), proposal);
      setState((current) => ({ ...current, busy: false, staged: proposal, status: {
        stagedRevisionId: proposal.revisionId,
        activeRevisionId: null,
        isActive: false,
        agentAvailable: false,
      } }));
      return proposal;
    } catch (error) {
      setState((current) => ({ ...current, busy: false, error: error instanceof Error ? error.message : String(error) }));
      return null;
    }
  }, [client, service, userId]);

  return { ...state, refresh, stage };
}
