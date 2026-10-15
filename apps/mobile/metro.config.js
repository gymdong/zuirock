// Expo's default config detects the pnpm workspace root (watchFolders + nodeModulesPaths),
// which works with the hoisted node_modules from .npmrc (node-linker=hoisted).
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
