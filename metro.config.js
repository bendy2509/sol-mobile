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

module.exports = config;
