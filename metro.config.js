// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Enable .wasm asset support for expo-sqlite web/wa-sqlite
config.resolver.assetExts.push('wasm');

// expo-sqlite on the web needs SharedArrayBuffer, i.e. a cross-origin isolated page. Hosting
// sends the headers from app.json (expo-router plugin); the dev server serves the HTML before
// Metro's middleware, so its responses get them here (this file only runs in the dev tooling).
const http = require('http');
const writeHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (...args) {
  if (!this.headersSent) {
    this.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    this.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  }
  return writeHead.apply(this, args);
};

// The Android app does not use expo-router's native tabs: their Material Symbols font (966 KB)
// is replaced by a stub there (lib/stubs/expo-symbols.android.js)
const path = require('path');
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'android' && moduleName === 'expo-symbols') {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'lib/stubs/expo-symbols.android.js') };
  }
  return defaultResolve ? defaultResolve(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
