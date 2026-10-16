// Expo's default config detects the pnpm workspace root (watchFolders + nodeModulesPaths),
// which works with the hoisted node_modules from .npmrc (node-linker=hoisted).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The in-app mock (./mock) is bundled only for EXPO_PUBLIC_API_MOCK=1 builds; production gets an
// empty module so no mock code ships.
if (process.env.EXPO_PUBLIC_API_MOCK !== '1') {
  const resolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === '../mock' && context.originModulePath.endsWith('/app/_layout.tsx')) return { type: 'empty' };
    return (resolve ?? context.resolveRequest)(context, moduleName, platform);
  };
}

module.exports = config;
