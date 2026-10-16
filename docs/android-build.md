# Android 릴리스 APK 만들기 (로컬, 사용자 PC)

APK는 사용자 PC에서 만든다. 키스토어 비밀번호는 사용자가 직접 입력하고 채팅·저장소에 쓰지 않는다. 필요한 값은 `PUBLIC_ORIGIN`(Render의 실제 주소)이다. 앱 링크(`/join/*`)와 API 주소가 이 값으로 구워지므로, 주소가 바뀌면 APK를 다시 만든다.

## 0. 준비 (이 PC 점검 결과)
| 도구 | 상태 |
|---|---|
| Java 17 (Zulu) | 있음 (`/usr/libexec/java_home -V`) |
| Android SDK `~/Library/Android/sdk` | 있음: platforms `android-36`, build-tools `35.0.0`·`36.1.0`, platform-tools |
| `adb` | 있음, 단 PATH에 없음: `~/Library/Android/sdk/platform-tools/adb` |
| `sdkmanager` / cmdline-tools | **없음**. Gradle이 부족한 구성요소를 자동으로 받으려면 라이선스 동의(`licenses/` 폴더 있음)가 필요하다. 막히면 Android Studio의 SDK Manager에서 "Android SDK Command-line Tools"를 설치한다 |
| NDK | 없음 (React Native 빌드 때 Gradle이 자동으로 받는다. 첫 빌드가 오래 걸린다) |
| `gradle` | 없어도 된다. `expo prebuild`가 만드는 `gradlew`를 쓴다 |

환경 변수(터미널마다):
```sh
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/36.1.0:$PATH
```

## 1. 키스토어 만들기 (한 번만, 사용자가 직접)
```sh
ANDROID_KEYSTORE_PASSWORD='<직접 정한 값>' ANDROID_KEY_PASSWORD='<직접 정한 값>' ANDROID_KEY_ALIAS=zuirock \
  scripts/make-keystore.sh
```
`apps/mobile/credentials/zuirock-release.jks`와 `apps/mobile/credentials.json`이 생기고(둘 다 git 제외) SHA-256 지문이 출력된다. 파일과 비밀번호는 비밀번호 관리자에 백업한다. 잃어버리면 앱 링크 검증이 깨진다.

## 2. SHA-256을 Render에 넣기
출력된 지문(`AA:BB:...`)을 Render Environment의 `ANDROID_CERT_SHA256`에 넣고 재배포한다. 여러 키를 쓰면 쉼표로 나열한다. 다시 확인하려면:
```sh
keytool -list -v -keystore apps/mobile/credentials/zuirock-release.jks -alias zuirock | grep SHA256
curl -s $PUBLIC_ORIGIN/.well-known/assetlinks.json   # sha256_cert_fingerprints에 지문이 보여야 한다
```

## 3. APK 빌드

### 방법 A: EAS 로컬 빌드 (EAS 로그인 필요, 무료)
`apps/mobile/eas.json`의 `preview` 프로필이 `credentialsSource: local`이라 `credentials.json`의 키스토어로 서명한다.
```sh
cd apps/mobile
export PUBLIC_ORIGIN=https://<실제 주소>.onrender.com
npx eas-cli@latest login            # 사용자가 직접
npx eas-cli@latest build --platform android --profile preview --local --output ./zuirock.apk
```

### 방법 B: prebuild + Gradle + 재서명 (계정 불필요)
```sh
cd apps/mobile
export PUBLIC_ORIGIN=https://<실제 주소>.onrender.com
npx expo prebuild --platform android --clean      # android/ 생성(git 제외)
cd android && ./gradlew assembleRelease           # 첫 빌드 10~20분
cd ..
APK=android/app/build/outputs/apk/release/app-release.apk
zipalign -f -p 4 $APK zuirock-aligned.apk
apksigner sign --ks credentials/zuirock-release.jks --ks-key-alias zuirock --out zuirock.apk zuirock-aligned.apk
```
`apksigner`가 비밀번호를 물으면 사용자가 입력한다.

### 서명 확인
```sh
apksigner verify --print-certs zuirock.apk   # SHA-256 digest가 2절의 지문과 같아야 한다
```

## 4. USB로 설치
휴대폰에서 개발자 옵션 > USB 디버깅을 켜고 케이블로 연결한다.
```sh
adb devices                     # 기기가 "device"로 보여야 한다
adb install -r zuirock.apk
```

## 5. 앱 링크(App Links) 확인 (AC-A8)
```sh
adb shell pm get-app-links com.zuirock.app         # <호스트>: verified 이어야 한다
adb shell pm verify-app-links --re-verify com.zuirock.app   # 다시 검증 요청
adb shell am start -a android.intent.action.VIEW -d "$PUBLIC_ORIGIN/join/1234"   # 앱이 열려야 한다
```
`verified`가 아니면 순서대로 확인한다.
1. `assetlinks.json`의 지문이 APK 서명 지문(3절 확인)과 같은지
2. `PUBLIC_ORIGIN`이 빌드 때와 Render가 같은지(https)
3. 기기가 인터넷에 연결돼 있는지(검증은 설치 직후 기기가 `assetlinks.json`을 받아 한다)

앱 미설치 상태에서 같은 링크는 웹으로 열려야 한다(`docs/manual-qa-checklist.md`).
