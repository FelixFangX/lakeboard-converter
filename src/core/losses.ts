/** Omissions a parser can see and does not copy. Counts are for the whole file, in this order. */
export const LOSS_CODES = ['relationship', 'summary', 'encrypted', 'internal-link', 'rich-note'] as const;
export type LossCode = typeof LOSS_CODES[number];

export interface ConversionLoss {
  code: LossCode;
  count: number;
}

export class LossTally {
  private readonly counts = new Map<LossCode, number>();

  add(code: LossCode, count = 1): void {
    if (count <= 0) return;
    this.counts.set(code, (this.counts.get(code) ?? 0) + count);
  }

  list(): ConversionLoss[] {
    return LOSS_CODES.flatMap(code => {
      const count = this.counts.get(code);
      return count ? [{ code, count }] : [];
    });
  }
}

/** Stable English sentence for CLI, MCP text, and the English web UI. */
export function lossSentence(loss: ConversionLoss): string {
  const count = loss.count;
  const one = count === 1;
  switch (loss.code) {
    case 'relationship': return `Dropped ${count} ${one ? 'relationship' : 'relationships'}.`;
    case 'summary': return `Dropped ${count} summary ${one ? 'topic' : 'topics'}.`;
    case 'encrypted': return `Kept ${count} encrypted ${one ? 'topic' : 'topics'} as title only.`;
    case 'internal-link': return `Dropped ${count} internal ${one ? 'link' : 'links'}.`;
    case 'rich-note': return `Dropped ${count} ${one ? 'note' : 'notes'} with no plain text.`;
  }
}

export function lossSentences(losses: readonly ConversionLoss[] | undefined): string[] {
  return (losses ?? []).map(lossSentence);
}
