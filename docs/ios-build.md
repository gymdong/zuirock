# iPhone 설치 빌드 (USB + Xcode + 무료 Apple ID)

회원 기기(iPhone)에 USB로 Release 앱을 직접 설치한다. 유료 개발자 계정이 없어도 된다(Personal Team). 무료 서명에는 Associated Domains가 없어 유니버설 링크는 쓰지 않는다. 게스트는 브라우저로 `PUBLIC_ORIGIN/join/<코드>`를 연다. Apple ID 비밀번호나 인증 코드는 사용자가 Xcode 창에 직접 입력한다.

이 Mac 점검 결과: Xcode 26.6(17F113), CocoaPods 1.16.2, iOS 26.5 시뮬레이터 있음. 사용자 iPhone(`gymdong`, iOS 26.6.1)은 기기 목록에 보이지만 점검 시점에는 Offline이었다(USB 연결·잠금 해제·신뢰 필요).

## 0. 사용자가 한 번만 하는 준비
1. Xcode > Settings > Accounts에서 `+` > Apple ID로 로그인한다.
2. iPhone: 설정 > 개인정보 보호 및 보안 > 개발자 모드 켜기 > 재시작 후 확인.
3. USB로 연결하고 iPhone에서 "이 컴퓨터를 신뢰"를 누른다. `xcrun xctrace list devices`의 Devices 항목(Offline이 아님)에 iPhone이 나와야 한다.

## 1. 빌드·설치 (Release, 번들 내장, Metro 불필요)
저장소 루트에서:
```sh
pnpm i
cd apps/mobile
export PUBLIC_ORIGIN=https://zuirock.onrender.com   # Render 실제 주소
unset EXPO_PUBLIC_API_MOCK                           # 목업 끔(기본이 꺼짐)
# 번들 ID가 이미 쓰였다면 고유한 값을 준다(2절). 기본값: com.zuirock.app
npx expo prebuild -p ios --clean
npx expo run:ios --configuration Release --device     # 기기 목록에서 iPhone 선택
```
- Release 구성이라 JS 번들이 앱에 포함된다. 설치 후 Mac이 없어도 실행된다.
- Xcode 서명 오류(`Signing for "app" requires a development team`)가 나면 `apps/mobile/ios/app.xcworkspace`를 Xcode로 열고 target `app` > Signing & Capabilities > Team을 Personal Team으로 고른 뒤 같은 명령을 다시 실행하거나 Xcode에서 iPhone을 선택해 Run한다(Product > Scheme > Edit Scheme > Run > Build Configuration = Release).
- 빌드는 성공했는데 설치 단계에서 `CommandError: InvalidHostID`가 나면(10/26) 이미 만든 앱을 직접 설치한다: `xcrun devicectl device install app --device <기기 ID> ~/Library/Developer/Xcode/DerivedData/app-*/Build/Products/Release-iphoneos/app.app` (기기 ID는 `xcrun xctrace list devices`)
- `database or disk is full`/`ENOSPC`는 Mac 저장 공간 부족이다. 빌드에 최소 10GB 여유가 필요하다. Docker 빌드 캐시(`docker builder prune -af`)와 옛 iOS 버전의 `~/Library/Developer/Xcode/iOS DeviceSupport/*`가 큰 편이다
- 설치 직후 iPhone: 설정 > 일반 > VPN 및 기기 관리 > 개발자 앱 > 사용자 Apple ID > "신뢰".
- `PUBLIC_ORIGIN`은 빌드 때 앱에 구워진다. Render 주소가 바뀌면 다시 빌드한다.

## 2. 번들 ID가 이미 쓰인 경우
무료 계정은 번들 ID가 전 세계에서 고유해야 한다. "Failed to register bundle identifier"가 나오면:
```sh
export IOS_BUNDLE_ID=com.zuirock.app.k3x9     # 임의의 짧은 문자열
npx expo prebuild -p ios --clean
npx expo run:ios --configuration Release --device
```
`apps/mobile/app.config.ts`가 `IOS_BUNDLE_ID`를 읽는다. 앱의 URL 스킴 `zuirock`은 번들 ID와 무관하므로 로그인에는 영향이 없다.

## 3. 7일 만료, 3개 제한, D13 재설치
- 무료 프로비저닝으로 설치한 앱은 **7일 뒤 열리지 않는다**. 시연 직전(D13)에 1절 명령으로 다시 설치한다(같은 번들 ID, 같은 Mac). 앱 데이터는 서버에 있으므로 다시 로그인만 하면 된다.
- 무료 계정은 기기당 활성 앱 3개, 7일 동안 App ID 생성 수 제한이 있다. 다른 개발 앱이 있으면 지운다. App ID 한도에 걸리면 같은 `IOS_BUNDLE_ID`를 재사용한다(새 값을 만들지 않는다).
- D10 이후에 처음 빌드하고, D13에 재설치한다(계획 R7).

## 4. 카카오 로그인 흐름 (네이티브)
1. 앱이 `POST /api/auth/kakao/start`에 `returnTo = zuirock://auth/callback`(`Linking.createURL('auth/callback')`)과 PKCE challenge를 보낸다.
2. 앱이 시스템 브라우저 인증 세션(`ASWebAuthenticationSession`)으로 카카오 로그인 페이지를 연다.
3. 카카오가 서버의 `PUBLIC_ORIGIN/api/auth/kakao/callback`으로 돌려보낸다. 서버는 일회용 교환 코드를 만들어 `zuirock://auth/callback?code=...`로 리다이렉트한다(서버는 `returnTo`가 자기 origin이나 `zuirock://`일 때만 허용).
4. 인증 세션이 앱으로 돌아오고, 앱이 `POST /api/auth/exchange`로 코드와 PKCE verifier를 보내 로그인 토큰을 받는다.
- 카카오 개발자 콘솔의 Redirect URI에는 **서버 콜백 URL 하나**(`https://zuirock.onrender.com/api/auth/kakao/callback`)만 등록한다. `zuirock://...`는 등록하지 않는다(카카오는 서버로만 돌려보낸다). 앱 스킴 리다이렉트는 무료 서명으로도 동작한다. Associated Domains가 필요 없다.
- 시뮬레이터에서 `zuirock://join/1234`를 열면 "'쥐락펴락'에서 열겠습니까?" 확인창이 뜨는 것으로 스킴 등록을 확인했다. 실제 카카오 로그인은 실기기 시험이 필요하다(점검 항목: `docs/manual-qa-checklist.md`).

## 5. 이 Mac에서 미리 확인한 것 (Apple ID 없이)
- `npx expo prebuild -p ios --clean` 성공, `pod install` 성공.
- Release 시뮬레이터 빌드: `xcodebuild -workspace app.xcworkspace -scheme app -configuration Release -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build` → `** BUILD SUCCEEDED **`. 앱 안에 `main.jsbundle`이 있고 `app.config`의 `publicOrigin`은 `https://zuirock.onrender.com`.
- iPhone 17 Pro 시뮬레이터에서 실행: 로그인 화면(카카오·네이버·Google 버튼)이 뜬다.
- 앱 설정: 스킴 `zuirock`, `NSAllowsArbitraryLoads=false`(https만. `NSAllowsLocalNetworking`은 Expo 기본값으로 로컬 IP만 허용), 번들 ID `com.zuirock.app`.
- 코드에서 `localhost`는 `apps/mobile/src/lib/config.ts`의 기본값 하나뿐이고, `extra.publicOrigin`이 설정되므로 Release에서는 쓰이지 않는다.
