# 효과음·배경음 (항목 9·10)

## 출처
`apps/mobile/assets/sfx/*.wav`와 `apps/mobile/assets/bgm/lobby.wav`는 이 저장소의 `scripts/gen-sfx.ts`가 합성한 **원본 자산**이다. 샘플·녹음·외부 음원을 쓰지 않았고(사각파·삼각파·사인파·노이즈와 엔벨로프만 사용), 제3자 라이선스가 없다. 다시 만들려면:

```
node scripts/gen-sfx.ts
```

결과는 결정적이다(시드 고정 노이즈). 소리를 바꾸려면 스크립트를 고치고 다시 실행한 뒤 WAV를 커밋한다.

## 파일
16비트 PCM 모노 WAV. 효과음 22,050 Hz(13개, 합계 약 320 KB, 각 61 KB 이하), 배경음 16,000 Hz(24초, 약 750 KB).

| 파일 | 이벤트 (`src/lib/events.ts`) | 소리 |
|---|---|---|
| tap | `tap` | 짧은 블립 |
| correct | `correct` | 도-미-솔-도 아르페지오 |
| wrong | `wrong` | 낮은 두 음 버즈 |
| hint | `hintReveal` (솔로 아이템 사용 포함) | 반짝이 |
| tick | `tick` (마지막 10초) | 우드블록 클릭 |
| questionStart | `questionStart` | 휘익 + 상승음 |
| reveal | `reveal` | 짠 두 음 |
| victory / defeat | `victory` / `defeat` | 팡파르 / 내려가는 슬라이드 |
| levelUp | `levelUp` | 상승 음계 + 화음 |
| chestOpen | `chestOpen` | 덜컹 + 반짝이 |
| purchase / error | 상점·상자 화면에서 직접 재생 | 코인 / 낮은 두 번 삑 |
| bgm/lobby | 홈·대기실 화면이 포커스일 때 (`useLobbyBgm`) | C–Am–F–G 8비트 루프, 120 BPM 12마디, 에코를 루프 처음으로 감아 이음매 없음 |

## 재생 (`apps/mobile/src/audio`)
- `manager.ts`: 백엔드와 무관한 `SoundManager`(음소거·볼륨·웹 잠금 해제·배경음 보유 카운트). 단위 테스트는 가짜 플레이어로 돈다.
- `index.ts`: expo-audio(SDK 57, 웹·네이티브 모두 지원) 플레이어 생성, 이벤트 버스 구독, 설정 저장(`zuirock.audio`), 웹은 첫 `pointerdown`/`keydown`/`touchend` 뒤에만 재생.
- 배경음은 마스터 볼륨의 25%로 재생되고, 대결 화면은 `useLobbyBgm`을 부르지 않으므로 대결 중에는 꺼진다.
- 설정 화면: 프로필 → 설정 (`/settings`) — 효과음 켜기/끄기, 배경음악 켜기/끄기, 볼륨.
- iOS는 무음 스위치를 따르고(`playsInSilentMode: false`) 다른 앱 음악과 섞인다(`mixWithOthers`).
