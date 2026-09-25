import { conclusionFromEntries, reportToSummary } from '@criblio/app-utils/investigator';
import type { InvestigatorTranscriptEntry, ReportResultUi } from '@criblio/app-utils/investigator';
import type { SummaryUi } from '@criblio/app-utils/agent-tools';

export type VerdictLabel = 'hot-dog' | 'not-hot-dog' | 'unclear';
export interface ParsedVerdict {
  label: VerdictLabel;
  title: 'Hot dog' | 'Not hot dog' | "Couldn't tell";
  reason: string;
  rawAnswer: string;
}

export function parseVerdict(answer: string): ParsedVerdict {
  const rawAnswer = answer.trim();
  const lines = rawAnswer.split(/\r?\n/);
  const first = (lines[0] ?? '').trim();
  const reason = lines.slice(1).join(' ').trim().replace(/\s+/g, ' ');
  // Check the negative label first: "NOT HOT DOG" contains "HOT DOG".
  if (/^NOT\s+HOT\s+DOG\b/i.test(first)) return { label: 'not-hot-dog', title: 'Not hot dog', reason, rawAnswer };
  if (/^HOT\s+DOG\b/i.test(first)) return { label: 'hot-dog', title: 'Hot dog', reason, rawAnswer };
  if (/^UNCLEAR\b/i.test(first)) return { label: 'unclear', title: "Couldn't tell", reason, rawAnswer };
  return { label: 'unclear', title: "Couldn't tell", reason: reason || 'No clear verdict was returned.', rawAnswer };
}

export function answerFromEntries(entries: InvestigatorTranscriptEntry[]): string {
  return conclusionFromEntries(entries).text.trim();
}

/** Read evidence from the framework's rendered report/summary result shape. */
export function findingReasonFromEntries(entries: InvestigatorTranscriptEntry[]): string {
  const entry = [...entries].reverse().find((item) => item.kind === 'toolCall'
    && (item.result?.ui?.kind === 'report' || item.result?.ui?.kind === 'summary'));
  if (!entry || entry.kind !== 'toolCall') return '';
  const ui = entry.result?.ui;
  if (!ui || typeof ui !== 'object') return '';
  const summary = ui.kind === 'report'
    ? reportToSummary(ui as ReportResultUi)
    : ui.kind === 'summary' ? ui as SummaryUi : null;
  if (!summary) return '';
  const findings = summary.findings.map((finding) => finding.details.trim()).filter(Boolean);
  if (findings.length === 0) return '';
  findings[0] = findings[0].replace(/^(?:NOT\s+HOT\s+DOG|HOT\s+DOG|UNCLEAR)\b\s*[:—-]?\s*/i, '');
  return findings.filter(Boolean).join(' ');
}

export function sessionDisposition(status: string): 'terminal' | 'soft' | 'active' {
  if (['complete', 'concluded', 'failed', 'error', 'cancelled'].includes(status)) return 'terminal';
  if (status === 'idle' || status === 'waiting') return 'soft';
  return 'active';
}
