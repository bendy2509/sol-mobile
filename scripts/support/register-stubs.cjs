// Node test runs only: the repositories import modules that exist on the phone. They are
// mapped to small stand-ins (scripts/support/stubs) so the real repository code runs on Node's
// built-in SQLite. Loaded with `tsx --require ./scripts/support/register-stubs.cjs`.
const Module = require('module');
const path = require('path');

const stubs = {
  'react-native': 'react-native.cjs',
  'expo-sqlite': 'expo-sqlite.cjs',
  '@react-native-async-storage/async-storage': 'async-storage.cjs',
  'react-native-get-random-values': 'empty.cjs',
};

globalThis.__DEV__ = false;
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (stubs[request]) return path.join(__dirname, 'stubs', stubs[request]);
  return resolve.call(this, request, ...rest);
};
