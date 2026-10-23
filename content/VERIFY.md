# 문제 교차검증 (AI 생성 → 다른 AI 검증 → 사람은 불일치만)

목적: 기존 600문제와, 시연 이후 추가할 자격증 문제(SQLD·컴활·운전면허·빅데이터분석기사)를 같은 방식으로 검증한다.

## 단계
1. **블라인드 분리**: `node scripts/verify-questions.ts blind content/incoming/<파일>.json 50`
   → `content/verification/<이름>.blind.N.json` (정답·해설 없음, 50문제씩)
2. **블라인드 풀이** (생성자와 다른 모델): blind 파일만 읽고 답한다. 결과 `<이름>.blind-answers.N.json`
   `[{"id":1,"answer":"...","confidence":"high|medium|low"}]`
3. **사실 확인** (또 다른 모델, 정답·해설 포함 원본을 봄): 결과 `<이름>.facts.N.json`
   `[{"id":1,"verdict":"ok|wrong|ambiguous|outdated","issue":"...","evidence":"..."}]`
4. **합치기**: `node scripts/verify-questions.ts merge content/incoming/<파일>.json`
   → `content/verification/<이름>.flags.md`. 블라인드 답이 정답과 다르거나, 확신이 낮거나, 사실 확인이 ok가 아닌 문제만 모인다.
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
