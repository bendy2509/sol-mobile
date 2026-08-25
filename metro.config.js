// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Enable .wasm asset support for expo-sqlite web/wa-sqlite
config.resolver.assetExts.push('wasm');

module.exports = config;
