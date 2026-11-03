import type { ConfigContext, ExpoConfig } from 'expo/config';

// Deployment origin comes only from the environment (PUBLIC_ORIGIN, see .env.example): the Render
// subdomain is confirmed on the dashboard and may differ from the placeholder. Invite links are
// <origin>/join/<code>; Android App Links are declared only for an https origin.
const publicOrigin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';
const origin = new URL(publicOrigin);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: '쥐락펴락',
  slug: 'zuirock',
  version: '0.1.0',
  scheme: 'zuirock',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  ios: {
    // Free Apple ID signing: the id must be globally unique. Override at prebuild time, e.g. IOS_BUNDLE_ID=com.zuirock.app.k3x9.
    bundleIdentifier: process.env.IOS_BUNDLE_ID ?? 'com.zuirock.app',
    // iPad 정식 지원: 폰 크기 호환 모드의 검은 양옆을 없애고 WideSides 로 채운다. iPhone 은 세로 고정, iPad 만 가로 허용.
    supportsTablet: true,
    requireFullScreen: true,
    infoPlist: {
      UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
      'UISupportedInterfaceOrientations~ipad': ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight', 'UIInterfaceOrientationPortrait'],
    },
  },
  android: {
    package: 'com.zuirock.app',
    intentFilters:
      origin.protocol === 'https:'
        ? [
            {
              action: 'VIEW',
              autoVerify: true,
              data: [{ scheme: 'https', host: origin.host, pathPrefix: '/join/' }],
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ]
        : [],
  },
  web: {
    output: 'single',
    bundler: 'metro',
  },
  plugins: ['expo-router'],
  extra: {
    /** Read at runtime via expo-constants (`Constants.expoConfig.extra.publicOrigin`). */
    publicOrigin: origin.origin,
  },
});
