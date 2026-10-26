// 문제 교차검증 도구 (사용법은 content/VERIFY.md)
//   node scripts/verify-questions.ts blind <questions.json> [chunk=50]  → content/verification/<name>.blind.<n>.json (정답·해설 제거본)
//   node scripts/verify-questions.ts solve-codex <questions.json>       → content/verification/<name>.blind-answers-codex.<n>.json (ChatGPT 계정으로 로그인한 Codex CLI가 블라인드 풀이)
//   node scripts/verify-questions.ts facts-codex <questions.json> [chunk=25] → content/verification/<name>.facts-codex.<n>.json (Codex가 정답·해설을 웹 검색으로 사실 확인)
//   node scripts/verify-questions.ts merge <questions.json>             → content/verification/<name>.flags.md (사람 검수 대상)
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

type Q = { type: 'chosung' | 'mcq' | 'ox'; question: string; answer: string; choices?: string[]; explanation: string; topic: string; subfield: string; difficulty: number; source?: { title: string; url: string } }
type Blind = { id: number; answer: string; confidence: 'high' | 'medium' | 'low'; note?: string }
type Fact = { id: number; verdict: 'ok' | 'wrong' | 'ambiguous' | 'outdated'; issue?: string; evidence?: string }

const OUT = 'content/verification'
const [cmd, file, arg] = process.argv.slice(2)
if (!cmd || !file) {
  console.error('사용법: verify-questions.ts blind|solve-codex|facts-codex|merge <questions.json> [chunk]')
  process.exit(1)
}
const name = basename(file, '.json')
const qs: Q[] = JSON.parse(readFileSync(file, 'utf8'))
mkdirSync(OUT, { recursive: true })
const readJson = <T>(p: string): T[] => JSON.parse(readFileSync(p, 'utf8'))
/** <name>.<kind>.N.json(Claude)과 <name>.<kind>-<모델>.N.json을 모델별 id → 결과로 모은다. */
function byModel<T extends { id: number }>(kind: string) {
  const out = new Map<string, Map<number, T>>()
  for (const f of readdirSync(OUT)) {
    if (!f.startsWith(`${name}.${kind}`)) continue
    const m = f.slice(`${name}.${kind}`.length).match(/^(?:-(\w+))?\.\d+\.json$/)
    if (!m) continue
    const model = m[1] ?? 'claude'
    if (!out.has(model)) out.set(model, new Map())
    for (const r of readJson<T>(join(OUT, f))) out.get(model)!.set(r.id, r)
  }
  return out
}

/** 저장소 밖 임시 폴더에 questions.json만 두고 Codex(ChatGPT 계정)를 읽기 전용으로 실행해 마지막 답(JSON 배열)을 받는다. */
async function codex<T>(questions: string, prompt: string, search: boolean): Promise<T[]> {
  const dir = mkdtempSync(join(tmpdir(), 'zuirock-verify-'))
  writeFileSync(join(dir, 'questions.json'), questions)
  const out = join(dir, 'answer.json')
  const args = [...(search ? ['--search'] : []), 'exec', '-s', 'read-only', '-C', dir, '--skip-git-repo-check', '--ephemeral', '-o', out, prompt]
  const run = promisify(execFile)('codex', args, { maxBuffer: 64 << 20, timeout: (search ? 15 : 5) * 60_000 })
  run.child.stdin?.end() // 열린 stdin이 있으면 codex가 추가 입력을 계속 기다린다
  await run
  return JSON.parse(readFileSync(out, 'utf8').replace(/^```\w*\n?|```\s*$/g, ''))
}

function checkIds(got: { id: number }[], want: { id: number }[], label: string) {
  if (got.map((a) => a.id).join() !== want.map((q) => q.id).join()) throw new Error(`${label}: 답 개수/순서가 문제와 다름`)
}

/** 묶음별로 동시에 돌리고, 실패한 묶음은 다시 실행하면 그것만 처리된다. */
async function runAll(todo: string[], job: (label: string) => Promise<void>) {
  // 한꺼번에 많이 띄우면 Codex가 답 없이 끝나는 경우가 있어 2개씩만 돌린다
  const results: PromiseSettledResult<string>[] = []
  for (let i = 0; i < todo.length; i += 2) results.push(...(await Promise.allSettled(todo.slice(i, i + 2).map(async (t) => (await job(t), t)))))
  for (const r of results) console.log(r.status === 'fulfilled' ? `완료 ${r.value}` : `실패 ${r.reason}`)
  console.log(`${todo.length}개 묶음 처리 (이미 있는 결과는 건너뜀)`)
  if (results.some((r) => r.status === 'rejected')) process.exit(1)
}

const files = (kind: string) => readdirSync(OUT).filter((f) => f.startsWith(`${name}.${kind}.`) && f.endsWith('.json')).map((f) => join(OUT, f))

if (cmd === 'blind') {
  const size = Number(arg ?? 50)
  for (let s = 0; s < qs.length; s += size) {
    const part = qs.slice(s, s + size).map((q, i) => ({
      id: s + i + 1,
      type: q.type,
      question: q.question,
      ...(q.choices ? { choices: q.choices } : {}),
    }))
    writeFileSync(join(OUT, `${name}.blind.${s / size + 1}.json`), JSON.stringify(part, null, 1))
  }
  console.log(`${qs.length}문제 → ${Math.ceil(qs.length / size)}개 파일 (${OUT}/${name}.blind.N.json)`)
} else if (cmd === 'solve-codex') {
  // 블라인드 유지: 정답이 든 저장소 밖 임시 폴더에 문제 파일만 복사하고, 읽기 전용으로 실행한다.
  const prompt = readFileSync('content/prompts/codex-blind-solver.md', 'utf8')
  const todo = files('blind').filter((p) => !existsSync(p.replace('.blind.', '.blind-answers-codex.')))
  await runAll(todo, async (p) => {
    const answers = await codex<Blind>(readFileSync(p, 'utf8'), prompt, false)
    checkIds(answers, readJson<{ id: number }>(p), p)
    writeFileSync(p.replace('.blind.', '.blind-answers-codex.'), JSON.stringify(answers, null, 1))
  })
} else if (cmd === 'facts-codex') {
  // 정답·해설·출처까지 주고 웹 검색을 켜서 사실 여부를 판정한다. 결과 <name>.facts-codex.N.json
  const size = Number(arg ?? 25)
  const prompt = readFileSync('content/prompts/codex-fact-checker.md', 'utf8')
  const chunks = Array.from({ length: Math.ceil(qs.length / size) }, (_, c) => c * size)
  const todo = chunks.map((s) => ({ s, out: join(OUT, `${name}.facts-codex.${s / size + 1}.json`) })).filter((t) => !existsSync(t.out))
  await runAll(todo.map((t) => t.out), async (out) => {
    const s = todo.find((t) => t.out === out)!.s
    const part = qs.slice(s, s + size).map((q, i) => ({
      id: s + i + 1,
      type: q.type,
      question: q.question,
      ...(q.choices ? { choices: q.choices } : {}),
      answer: q.answer,
      explanation: q.explanation,
      source: q.source,
    }))
    const facts = await codex<Fact>(JSON.stringify(part, null, 1), prompt, true)
    checkIds(facts, part, out)
    writeFileSync(out, JSON.stringify(facts, null, 1))
  })
} else if (cmd === 'merge') {
  // 결과 파일 규칙: <name>.<종류>.N.json = Claude, <name>.<종류>-<모델>.N.json = 다른 모델(예: -codex). 종류는 blind-answers(Blind[]), facts(Fact[])
  const solvers = byModel<Blind>('blind-answers')
  const checkers = byModel<Fact>('facts')
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  const rows: string[] = []
  let missing = 0
  const at = <T,>(m: Map<string, Map<number, T>>, id: number) => [...m].flatMap(([model, byId]) => (byId.has(id) ? [[model, byId.get(id)!] as const] : []))
  qs.forEach((q, i) => {
    const id = i + 1
    const answers = at(solvers, id)
    const facts = at(checkers, id)
    const why: string[] = []
    if (!answers.length || !facts.length) {
      missing++
      return
    }
    for (const [solver, b] of answers) {
      const note = b.note ? ` (메모: ${b.note})` : ''
      if (norm(b.answer) !== norm(q.answer)) why.push(`${solver} 블라인드 답 불일치: 풀이 "${b.answer}" ≠ 정답 "${q.answer}"${note}`)
      else if (b.confidence === 'low') why.push(`${solver} 블라인드 풀이 확신 낮음${note}`)
    }
    for (const [checker, f] of facts) {
      if (f.verdict !== 'ok') why.push(`${checker} 사실 확인 ${f.verdict}: ${f.issue ?? ''}${f.evidence ? ` (근거: ${f.evidence})` : ''}`)
    }
    if (why.length) rows.push(`### #${id} [${q.topic}/${q.subfield} ★${q.difficulty} ${q.type}]\n- 문제: ${q.question}\n- 정답: ${q.answer}\n${why.map((w) => `- ⚠ ${w}`).join('\n')}\n`)
  })
  const checked = qs.length - missing
  const head = `# ${name} 교차검증 결과\n\n풀이: ${[...solvers.keys()].join(', ') || '없음'} / 사실 확인: ${[...checkers.keys()].join(', ') || '없음'}\n\n전체 ${qs.length}문제 중 검증 완료 ${checked}, 미검증 ${missing}, **사람 검수 대상 ${rows.length}**\n\n`
  writeFileSync(join(OUT, `${name}.flags.md`), head + rows.join('\n'))
  console.log(head.trim())
  if (!existsSync(join(OUT, `${name}.flags.md`))) process.exit(1)
} else {
  console.error(`알 수 없는 명령: ${cmd}`)
  process.exit(1)
}
