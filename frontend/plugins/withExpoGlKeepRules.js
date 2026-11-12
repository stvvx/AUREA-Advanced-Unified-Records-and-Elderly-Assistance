const fs = require('node:fs/promises');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

// expo-gl creates Android views through reflection and calls Java from JNI.
// Preserve these entry points when R8 optimizes the release APK (Expo #51948).
const keepRule = '-keep class expo.modules.gl.** { *; }';

module.exports = function withExpoGlKeepRules(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const rulesPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro'
      );
      const contents = await fs.readFile(rulesPath, 'utf8');
      if (!contents.includes(keepRule)) {
        await fs.appendFile(rulesPath, `\n# Preserve expo-gl reflection and JNI entry points.\n${keepRule}\n`);
      }
      return modConfig;
    },
  ]);
};
