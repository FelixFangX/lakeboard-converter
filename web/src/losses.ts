import { lossSentence, type ConversionLoss } from '../../src/core/losses.js';

/** One line for the result heading. English matches the CLI. Chinese stays in this module. */
export function lossLine(losses: readonly ConversionLoss[] | undefined, language: 'en' | 'zh'): string {
  if (!losses?.length) return '';
  if (language === 'en') return losses.map(lossSentence).join(' ');
  return losses.map(chineseLoss).join('');
}

function chineseLoss(loss: ConversionLoss): string {
  const count = loss.count;
  switch (loss.code) {
    case 'relationship': return `已省略 ${count} 条关系。`;
    case 'summary': return `已省略 ${count} 个摘要主题。`;
    case 'encrypted': return `已保留 ${count} 个加密主题的标题。`;
    case 'internal-link': return `已省略 ${count} 个内部链接。`;
    case 'rich-note': return `已省略 ${count} 条没有纯文本的备注。`;
  }
}
