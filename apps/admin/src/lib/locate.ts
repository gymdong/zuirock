export interface ItemLocation {
  /** 1-based line in the file where the n-th top-level array element starts. */
  line: number;
}

/** Scans raw JSON text and returns where each top-level array element starts (string/escape aware). Same logic as scripts/import-questions.ts. */
export function locateItems(text: string): ItemLocation[] {
  const out: ItemLocation[] = [];
  let depth = 0;
  let line = 1;
  let inStr = false;
  let esc = false;
  let expectItem = false;
  for (const ch of text) {
    if (ch === '\n') line++;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (/\s/u.test(ch)) continue;
    if (expectItem && depth === 1) {
      out.push({ line });
      expectItem = false;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[' || ch === '{') {
      depth++;
      if (ch === '[' && depth === 1) expectItem = true;
    } else if (ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 1) expectItem = true;
  }
  return out;
}

export interface ItemInfo {
  no?: number;
  line?: number;
  preview?: string;
}

export function itemInfo(raw: unknown, locs: ItemLocation[], index: number): ItemInfo {
  const item = Array.isArray(raw) ? (raw[index - 1] as Record<string, unknown> | undefined) : undefined;
  const q = typeof item?.['question'] === 'string' ? [...item['question']] : null;
  return {
    ...(typeof item?.['no'] === 'number' ? { no: item['no'] } : {}),
    ...(locs[index - 1] ? { line: locs[index - 1]!.line } : {}),
    ...(q ? { preview: `${q.slice(0, 25).join('')}${q.length > 25 ? '…' : ''}` } : {}),
  };
}

export function describeItem(info: ItemInfo): string {
  const parts = [info.no !== undefined ? `no ${info.no}` : null, info.line !== undefined ? `줄 ${info.line}` : null].filter(Boolean);
  return parts.join(', ');
}
