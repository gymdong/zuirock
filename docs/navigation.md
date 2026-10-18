# 화면 이동 그래프 (모바일·웹)

뒤로가기(웹 브라우저, Android 하드웨어 버튼, 화면 왼쪽 위 `<`)는 항상 "한 단계 위의 화면"으로 간다. 이 규칙을 지키려고 풀이 화면과 결과 화면, 고르기 화면은 히스토리에 쌓지 않는다. 기준은 `docs/feedback-round2.md` 1번이다.

## 이동 방식

| 방식 | expo-router | 쓰는 곳 |
|---|---|---|
| 쌓기 | `router.push` | 아래 단계로 들어갈 때(홈 → 주제 화면, 주제 화면 → 스테이지 풀이) |
| 바꾸기 | `router.replace` | 같은 단계에서 다음 화면으로 넘어갈 때. 풀이 → 결과, 결과 → 다음 스테이지 풀이, 시작 방법 고르기 → 테스트 풀이, 방 만들기 → 대기실 → 대결 → 결과 |
| 위로 돌아가기 | `router.dismissTo(href)` | 결과 화면의 "주제 화면으로"·"홈으로", 레벨 확정, 방 나가기. 스택에 그 화면이 있으면 그 위를 모두 걷어 내고, 없으면 현재 화면을 바꾼다 |

## 그래프

```
홈 (/home)
├─ push → 주제 화면 (/topics/:id)                         ← 시작 안 한 주제면 /topics/:id/start 로 Redirect(바꾸기)
│   ├─ push → 스테이지 풀이 (/solo/play?kind=stage)
│   │          └─ replace → 결과 (/solo/result)
│   │                       ├─ replace → 다음 스테이지 풀이 ("Lv.N 도전" / "다시 도전")
│   │                       └─ dismissTo → 주제 화면 ("주제 화면으로")
│   └─ push → 시작 방법 (/topics/:id/start?checkpoint=N)   ← "다른 구간으로 점프"
│              ├─ replace → 기초 테스트 풀이 → replace → 결과 → dismissTo 주제 화면
│              ├─ replace → 레벨테스트 풀이 → replace → 레벨테스트 결과 (/solo/placement) → dismissTo 주제 화면
│              └─ (Lv.1) dismissTo → 주제 화면
├─ push → 종합·3분 지식 풀이 → replace → 결과 → dismissTo 홈
├─ push → 방 만들기 (/battle/create) → replace → 대기실 (/room/:code/lobby)
│              대기실 ⇄ 대결 (/room/:code/play) ⇄ 결과 (/room/:code/result): 방 상태(phase)에 따라 replace
│              나가기 → dismissTo 홈 (게스트는 /join/:code)
└─ push → 주제 고르기 (/topics/select) → 저장 → dismissTo 홈

초대 링크 (/join/:code) → replace → 대기실 …
```

## 예: 22 → 80 스테이지 점프

1. 홈 → 주제 화면(Lv.22) → "다른 구간으로 점프 80" → 시작 방법 → "Lv.80 기초 테스트 보기" → 풀이 → 결과. 이때 스택은 `[홈, 주제 화면, 결과]`이다.
2. 결과에서 뒤로가기 1번 → 주제 화면, 2번 → 홈.

Playwright로 같은 순서를 확인한다(LD 보고서 참고).
