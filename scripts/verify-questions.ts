// 문제 교차검증 도구 (사용법은 content/VERIFY.md)
//   node scripts/verify-questions.ts blind <questions.json> [chunk=50]  → content/verification/<name>.blind.<n>.json (정답·해설 제거본)
//   node scripts/verify-questions.ts merge <questions.json>             → content/verification/<name>.flags.md (사람 검수 대상)
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

type Q = { type: 'chosung' | 'mcq' | 'ox'; question: string; answer: string; choices?: string[]; explanation: string; topic: string; subfield: string; difficulty: number }
type Blind = { id: number; answer: string; confidence: 'high' | 'medium' | 'low' }
type Fact = { id: number; verdict: 'ok' | 'wrong' | 'ambiguous' | 'outdated'; issue?: string; evidence?: string }

const OUT = 'content/verification'
const [cmd, file, arg] = process.argv.slice(2)
if (!cmd || !file) {
  console.error('사용법: verify-questions.ts blind|merge <questions.json> [chunk]')
  process.exit(1)
}
const name = basename(file, '.json')
const qs: Q[] = JSON.parse(readFileSync(file, 'utf8'))
mkdirSync(OUT, { recursive: true })
const readJson = <T>(p: string): T[] => JSON.parse(readFileSync(p, 'utf8'))
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
} else if (cmd === 'merge') {
  // 결과 파일 규칙: <name>.blind-answers.N.json (Blind[]), <name>.facts.N.json (Fact[])
  const blind = new Map(files('blind-answers').flatMap(readJson<Blind>).map((b) => [b.id, b]))
  const facts = new Map(files('facts').flatMap(readJson<Fact>).map((f) => [f.id, f]))
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  const rows: string[] = []
  let missing = 0
  qs.forEach((q, i) => {
    const id = i + 1
    const b = blind.get(id)
    const f = facts.get(id)
    const why: string[] = []
    if (!b || !f) {
      missing++
      return
    }
    if (norm(b.answer) !== norm(q.answer)) why.push(`블라인드 답 불일치: 풀이 "${b.answer}" ≠ 정답 "${q.answer}"`)
    else if (b.confidence === 'low') why.push('블라인드 풀이 확신 낮음')
    if (f.verdict !== 'ok') why.push(`사실 확인 ${f.verdict}: ${f.issue ?? ''}${f.evidence ? ` (근거: ${f.evidence})` : ''}`)
    if (why.length) rows.push(`### #${id} [${q.topic}/${q.subfield} ★${q.difficulty} ${q.type}]\n- 문제: ${q.question}\n- 정답: ${q.answer}\n${why.map((w) => `- ⚠ ${w}`).join('\n')}\n`)
  })
  const checked = qs.length - missing
  const head = `# ${name} 교차검증 결과\n\n전체 ${qs.length}문제 중 검증 완료 ${checked}, 미검증 ${missing}, **사람 검수 대상 ${rows.length}**\n\n`
  writeFileSync(join(OUT, `${name}.flags.md`), head + rows.join('\n'))
  console.log(head.trim())
  if (!existsSync(join(OUT, `${name}.flags.md`))) process.exit(1)
} else {
  console.error(`알 수 없는 명령: ${cmd}`)
  process.exit(1)
}
