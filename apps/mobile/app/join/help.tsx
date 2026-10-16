import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Screen } from '../../src/components/Screen';
import { Card, Muted } from '../../src/components/ui';
import { inviteUrl } from '../../src/lib/config';
import { IN_APP_NAMES, type InAppBrowser } from '../../src/lib/inAppBrowser';
import { colors, titleFont } from '../../src/theme';

/** Fallback when an in-app browser cannot be escaped programmatically (e.g. iOS Instagram). */
export default function JoinHelp() {
  const router = useRouter();
  const { code, app, os } = useLocalSearchParams<{ code: string; app?: InAppBrowser; os?: string }>();
  const [copied, setCopied] = useState(false);
  const name = app ? IN_APP_NAMES[app] : '앱 안의 브라우저';
  const url = inviteUrl(code);
  return (
    <Screen title="브라우저에서 열기" back={false}>
      <Card style={{ gap: 12 }}>
        <Text style={[titleFont(20), { color: colors.ink }]}>{name}에서는 대결이 끊길 수 있어요</Text>
        <Muted>
          {os === 'ios'
            ? '화면 오른쪽 아래(또는 위)의 ··· 메뉴에서 "Safari로 열기"를 눌러 주세요.'
            : '오른쪽 위 ⋮ 메뉴에서 "다른 브라우저로 열기"를 눌러 주세요.'}
        </Muted>
        <Muted>메뉴가 없으면 링크를 복사해서 Safari나 Chrome 주소창에 붙여 넣어 주세요.</Muted>
        <Text selectable style={{ color: colors.primary }}>{url}</Text>
      </Card>
      <View style={{ gap: 8 }}>
        <Button
          label={copied ? '복사했어요!' : '링크 복사하기'}
          onPress={async () => {
            await Clipboard.setStringAsync(url);
            setCopied(true);
          }}
        />
        <Button variant="white" size="md" label="그래도 여기서 계속하기" onPress={() => router.replace(`/join/${code}?stay=1`)} />
      </View>
    </Screen>
  );
}
