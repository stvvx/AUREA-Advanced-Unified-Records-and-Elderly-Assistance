// metro.config.js
// ─────────────────────────────────────────────────────────────────────────────
// Expo Metro Bundler Configuration
// Adds support for .glb (3D models) and .html (WebView assets) file types
// ─────────────────────────────────────────────────────────────────────────────

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add .glb and .html to the list of asset extensions so Metro bundles them
config.resolver.assetExts.push('glb', 'gltf', 'html', 'bin', 'hdr');

module.exports = config;
