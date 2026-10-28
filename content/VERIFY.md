# 문제 교차검증 (AI 생성 → 다른 AI 검증 → 사람은 불일치만)

목적: 기존 600문제와, 시연 이후 추가할 자격증 문제(SQLD·컴활·운전면허·빅데이터분석기사)를 같은 방식으로 검증한다.

## 단계
0. **중복 확인**: `python3 scripts/check-dup.py content/incoming/<파일>.json` — 같은 지식을 다른 말로 묻는 중복 의심 쌍(`content/GUIDE.md` 6절)
1. **블라인드 분리**: `node scripts/verify-questions.ts blind content/incoming/<파일>.json 50`
   → `content/verification/<이름>.blind.N.json` (정답·해설 없음, 50문제씩)
2. **블라인드 풀이** (생성자와 다른 모델): blind 파일만 읽고 답한다. 결과 `<이름>.blind-answers.N.json`(Claude), 다른 모델은 `<이름>.blind-answers-<풀이자>.N.json`
   `[{"id":1,"answer":"...","confidence":"high|medium|low","note":"정답이 여럿일 수 있는 이유(선택)"}]`
   - ChatGPT(Codex CLI, `codex login`으로 ChatGPT 계정 로그인 필요): `node scripts/verify-questions.ts solve-codex content/incoming/<파일>.json`
     → `<이름>.blind-answers-codex.N.json`. 저장소 밖 임시 폴더에 blind 파일만 복사해 읽기 전용으로 돌린다. 지시문은 `content/prompts/codex-blind-solver.md`. 이미 있는 결과는 건너뛰므로 실패한 묶음은 다시 실행하면 된다
   - blind 파일에는 초성 힌트가 없다. 초성 문제에서 풀이자가 다른 낱말을 답하면 초성으로 걸러지는지 먼저 본다
3. **사실 확인** (또 다른 모델, 정답·해설 포함 원본을 봄): 결과 `<이름>.facts.N.json`
   `[{"id":1,"verdict":"ok|wrong|ambiguous|outdated","issue":"...","evidence":"..."}]`
   - ChatGPT(Codex, 웹 검색 켬): `node scripts/verify-questions.ts facts-codex content/incoming/<파일>.json [묶음 크기=25]`
     → `<이름>.facts-codex.N.json`. 지시문은 `content/prompts/codex-fact-checker.md`. 근거 주소는 사람이 열어서 확인한다(모델이 주소를 지어낼 수 있음)
4. **합치기**: `node scripts/verify-questions.ts merge content/incoming/<파일>.json`
   → `content/verification/<이름>.flags.md`. 풀이자 중 누구라도 블라인드 답이 정답과 다르거나, 확신이 낮거나, 사실 확인자 중 누구라도 ok가 아니라고 한 문제만 모인다.
5. **사람 검수**: flags.md의 문제만 관리자 화면에서 확인·수정한다. 나머지는 표본 5%만 본다.

## 지키는 규칙
- 풀이자에게 `content/incoming/`를 열지 못하게 한다(정답이 보이면 블라인드가 아님).
- 생성·풀이·사실 확인은 서로 다른 모델/세션으로 한다. 같은 모델은 같은 오류를 같이 놓친다.
- 일치 = 맞음이 아니다. 통과한 문제에도 표본 검수는 남긴다.

## 자격증 확장 시 추가로 필요한 것 (시연 이후)
- 기출·문제은행 복사 금지. 개념을 바탕으로 새로 만든 문제만 쓴다
- 법규(운전면허)는 기준 법령 개정일을 `source`에 적는다
- SQLD는 코드 보기 표시와 SQL 실행 결과 검증(실제 DB로 돌려 확인)을 단계 3에 추가
- 스키마(`topic`/`subfield` enum), 서버, 관리자 화면, 종합 세트 배분 영향 조사 후 구현
