/**
 * Keeps only the French and English resources of the Android libraries in the APK.
 * The app's own texts (French, Kreyòl) live in the JS bundle; the libraries ship strings for
 * ~80 languages that the app never shows (resources.arsc). Applied at prebuild and on EAS.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const LINE = 'resourceConfigurations += ["fr", "en"]';

module.exports = function withResourceConfigs(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(LINE)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(/defaultConfig\s*\{/, (m) => `${m}\n        ${LINE}`);
    }
    return cfg;
  });
};
