/**
 * 문제 JSON 가져오기 (AC-C2).
 *
 *   node scripts/import-questions.ts --dry-run <파일|폴더>...        형식 검사만, 아무것도 쓰지 않음
 *   node scripts/import-questions.ts --target local|prod <파일|폴더>... 통과한 문제를 draft로 올림
 *
 * 환경 변수 (--target 일 때):
 *   ADMIN_TOKEN       관리자 JWT (필수)
 *   API_URL_LOCAL     기본 http://localhost:3000
 *   API_URL_PROD      배포 주소 (보통 PUBLIC_ORIGIN 과 같은 값, 필수)
 *
 * 같은 문구(정규화 기준)는 건너뛰므로 다시 실행해도 안전하다.
 * 검사는 @zuirock/game-rules 의 validateImport 를 쓰고, 아직 구현 전이면 같은 규칙의 내장 검사로 대신한다.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { questionInputSchema, type ImportErrorDto, type QuestionInput } from '@zuirock/shared';
import * as gameRules from '@zuirock/game-rules';

export interface FileValidation {
  accepted: Array<{ index: number; question: QuestionInput; normalizedText: string }>;
  errors: ImportErrorDto[];
  warnings: ImportErrorDto[];
  total: number;
}

/** game-rules `normalize` 와 같은 규칙: NFC, 공백·구두점·기호 제거, ASCII 소문자. */
export function normalizeText(text: string): string {
  return text.normalize('NFC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
}

/** 내장 검사. LA의 validateImport 가 구현되면 쓰이지 않는다. */
export function builtinValidate(raw: unknown, existing: ReadonlySet<string>): FileValidation {
  const out: FileValidation = { accepted: [], errors: [], warnings: [], total: 0 };
  if (!Array.isArray(raw)) {
    out.errors.push({ index: 0, code: 'NOT_ARRAY', message: '파일 최상위가 JSON 배열이 아닙니다' });
    return out;
  }
  if (raw.length === 0) {
    out.errors.push({ index: 0, code: 'EMPTY', message: '문제가 하나도 없습니다' });
    return out;
  }
  out.total = raw.length;
  const seen = new Set<string>();
  raw.forEach((item: unknown, i) => {
    const index = i + 1;
    const parsed = questionInputSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        out.errors.push({ index, field: issue.path.join('.') || undefined, code: 'SCHEMA', message: issue.message });
      }
      return;
    }
    const q = parsed.data;
    if (q.type === 'mcq' && !(q.choices ?? []).includes(q.answer)) {
      out.errors.push({ index, field: 'answer', code: 'ANSWER_NOT_IN_CHOICES', message: '정답이 보기 4개 중 하나와 똑같지 않습니다' });
      return;
    }
    const normalizedText = normalizeText(q.question);
    if (seen.has(normalizedText)) {
      out.errors.push({ index, field: 'question', code: 'DUPLICATE_IN_FILE', message: '같은 파일에 같은 문구의 문제가 앞에 있습니다' });
      return;
    }
    if (existing.has(normalizedText)) {
      out.errors.push({ index, field: 'question', code: 'DUPLICATE_EXISTING', message: '이미 있는 문제와 문구가 같습니다' });
      return;
    }
    seen.add(normalizedText);
    if (q.type !== 'ox' && normalizeText(q.question).includes(normalizeText(q.answer)) && q.answer.length >= 2) {
      out.warnings.push({ index, field: 'question', code: 'ANSWER_IN_QUESTION', message: '문제 문장에 정답이 들어 있습니다' });
    }
    out.accepted.push({ index, question: q, normalizedText });
  });
  return out;
}

/** LA 구현이 있으면 그것을, 없으면(NotImplementedError) 내장 검사를 쓴다. */
export function validateFile(raw: unknown, existing: ReadonlySet<string>): FileValidation {
  try {
    const v = gameRules.validateImport(raw, existing);
    const total = Array.isArray(raw) ? raw.length : 0;
    return { ...v, total };
  } catch (e) {
    if (e instanceof Error && e.name === 'NotImplementedError') return builtinValidate(raw, existing);
    throw e;
  }
}

export function collectFiles(inputs: string[]): string[] {
  const files: string[] = [];
  const walk = (p: string): void => {
    const s = statSync(p);
    if (s.isDirectory()) {
      for (const name of readdirSync(p).sort()) walk(join(p, name));
    } else if (p.endsWith('.json')) {
      files.push(p);
    }
  };
  for (const input of inputs) {
    if (!existsSync(input)) throw new Error(`경로를 찾을 수 없습니다: ${input}`);
    walk(input);
  }
  return files;
}

export interface ItemLocation {
  /** 1-based line in the file where the n-th top-level array element starts. */
  line: number;
}

/** Scans raw JSON text and returns where each top-level array element starts (string/escape aware). */
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

/** `파일:74번째(no 74, 줄 1182) '문제 앞 25자…' [필드] 이유` */
export function formatIssue(file: string, issue: ImportErrorDto, info: ItemInfo = {}): string {
  const message = issue.message.replace(`${issue.index}번째 문제: `, '');
  const field = issue.field ? `[${issue.field}] ` : '';
  if (issue.index <= 0) return `${file}:파일 전체: ${field}${message}`;
  const parts = [info.no !== undefined ? `no ${info.no}` : null, info.line !== undefined ? `줄 ${info.line}` : null].filter(Boolean);
  const where = `${issue.index}번째${parts.length ? `(${parts.join(', ')})` : ''}`;
  return `${file}:${where}${info.preview ? ` '${info.preview}'` : ''} ${field}${message}`;
}

export interface RunOptions {
  dryRun: boolean;
  target?: 'local' | 'prod';
  inputs: string[];
}

export function parseArgs(argv: string[]): RunOptions | 'help' {
  const opts: RunOptions = { dryRun: false, inputs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--help' || a === '-h') return 'help';
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--target') {
      const t = argv[++i];
      if (t !== 'local' && t !== 'prod') throw new Error('--target 은 local 또는 prod 여야 합니다');
      opts.target = t;
    } else if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
    else opts.inputs.push(a);
  }
  if (opts.inputs.length === 0) throw new Error('파일 또는 폴더를 지정하세요');
  if (!opts.dryRun && !opts.target) throw new Error('--dry-run 또는 --target local|prod 중 하나가 필요합니다');
  return opts;
}

async function upload(opts: RunOptions, file: string, items: QuestionInput[]): Promise<string> {
  const token = process.env['ADMIN_TOKEN'];
  if (!token) throw new Error('ADMIN_TOKEN 환경 변수가 필요합니다');
  const base = opts.target === 'prod' ? process.env['API_URL_PROD'] : (process.env['API_URL_LOCAL'] ?? 'http://localhost:3000');
  if (!base) throw new Error('API_URL_PROD 환경 변수가 필요합니다');
  // 가정: LB 의 POST /api/admin/questions/import 는 { questions, dryRun } 을 받고 ImportResultDto 를 돌려준다.
  const res = await fetch(`${base.replace(/\/$/, '')}/api/admin/questions/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ questions: items, dryRun: false }),
  });
  if (!res.ok) throw new Error(`${file}: 서버 오류 ${res.status} ${await res.text()}`);
  const result = (await res.json()) as { acceptedCount: number; errors: ImportErrorDto[] };
  for (const e of result.errors) console.error(formatIssue(file, e));
  return `${file}: 서버가 ${result.acceptedCount}건을 draft로 받았습니다`;
}

export async function run(opts: RunOptions): Promise<number> {
  const files = collectFiles(opts.inputs);
  if (files.length === 0) throw new Error('.json 파일이 없습니다');
  const existing = new Set<string>();
  let totalQ = 0;
  let totalOk = 0;
  let totalErr = 0;
  let totalWarn = 0;
  for (const file of files) {
    let raw: unknown;
    let text = '';
    try {
      text = readFileSync(file, 'utf8');
      raw = JSON.parse(text);
    } catch (e) {
      console.error(`${file}: JSON을 읽을 수 없습니다 (${(e as Error).message})`);
      totalErr++;
      continue;
    }
    const v = validateFile(raw, existing);
    const locs = locateItems(text);
    for (const e of v.errors) console.error(formatIssue(file, e, itemInfo(raw, locs, e.index)));
    for (const w of v.warnings) console.warn(`${formatIssue(file, w, itemInfo(raw, locs, w.index))} (경고)`);
    for (const a of v.accepted) existing.add(a.normalizedText);
    totalQ += v.total;
    totalOk += v.accepted.length;
    totalErr += v.errors.length;
    totalWarn += v.warnings.length;
    console.log(`${file}: ${v.total}문제 중 ${v.accepted.length}개 통과, 오류 ${v.errors.length}건`);
    if (!opts.dryRun && v.accepted.length > 0) {
      console.log(await upload(opts, file, v.accepted.map((a) => a.question)));
    }
  }
  console.log(`합계: ${files.length}개 파일, ${totalQ}문제, 통과 ${totalOk}, 오류 ${totalErr}, 경고 ${totalWarn}${opts.dryRun ? ' (dry-run: 아무것도 쓰지 않음)' : ''}`);
  return totalErr > 0 ? 1 : 0;
}

const HELP = readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]!.replace(/^\/\*\*\n|^ \* ?/gm, '');

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts === 'help') console.log(HELP);
    else process.exitCode = await run(opts);
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 2;
  }
}
