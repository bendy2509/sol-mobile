// Android build only (metro.config.js): expo-router's native tabs import expo-symbols, which
// ships a 966 KB Material Symbols font. The app draws its own icons (components/ui/Icon) and
// does not use native tabs, so the font stays out of the APK. Using native tabs with Material
// symbols would need this stub removed.
module.exports = {
  unstable_getMaterialSymbolSourceAsync: async () => {
    throw new Error('expo-symbols is not bundled in this app (lib/stubs/expo-symbols.android.js)');
  },
};
