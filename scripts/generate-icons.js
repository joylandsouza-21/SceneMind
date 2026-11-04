const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const ICONS_DIR = path.join(BUILD_DIR, 'icons');
const ELECTRON_DIR = path.join(ROOT_DIR, 'electron');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

[BUILD_DIR, ICONS_DIR, ELECTRON_DIR, PUBLIC_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// High-resolution SVG branding for SceneMind AI Studio
const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0f1d" />
      <stop offset="50%" stop-color="#070a14" />
      <stop offset="100%" stop-color="#03050a" />
    </linearGradient>

    <!-- Border Ring Gradient -->
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f2fe" />
      <stop offset="35%" stop-color="#4facfe" />
      <stop offset="70%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#a855f7" />
    </linearGradient>

    <!-- Film / Core Gradient -->
    <linearGradient id="coreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>

    <!-- Glow Gradient -->
    <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00d2ff" stop-opacity="0.35" />
      <stop offset="60%" stop-color="#4f46e5" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>

    <!-- Shadow Filter -->
    <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#00f2fe" flood-opacity="0.25" />
    </filter>
  </defs>

  <!-- Ambient Glow Behind Icon -->
  <circle cx="256" cy="256" r="220" fill="url(#centerGlow)" />

  <!-- App Squircle Outer Border -->
  <rect x="24" y="24" width="464" height="464" rx="108" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="12" filter="url(#dropShadow)" />

  <!-- Subtle Inner Film Frame Grid -->
  <rect x="68" y="68" width="376" height="376" rx="64" fill="#0f172a" fill-opacity="0.5" stroke="#1e293b" stroke-width="4" stroke-dasharray="12 8" />

  <!-- Top Film Sprocket Holes -->
  <rect x="100" y="88" width="36" height="24" rx="6" fill="#38bdf8" fill-opacity="0.7" />
  <rect x="160" y="88" width="36" height="24" rx="6" fill="#38bdf8" fill-opacity="0.7" />
  <rect x="220" y="88" width="36" height="24" rx="6" fill="#38bdf8" fill-opacity="0.7" />
  <rect x="280" y="88" width="36" height="24" rx="6" fill="#38bdf8" fill-opacity="0.7" />
  <rect x="340" y="88" width="36" height="24" rx="6" fill="#38bdf8" fill-opacity="0.7" />

  <!-- Bottom Film Sprocket Holes -->
  <rect x="100" y="400" width="36" height="24" rx="6" fill="#6366f1" fill-opacity="0.7" />
  <rect x="160" y="400" width="36" height="24" rx="6" fill="#6366f1" fill-opacity="0.7" />
  <rect x="220" y="400" width="36" height="24" rx="6" fill="#6366f1" fill-opacity="0.7" />
  <rect x="280" y="400" width="36" height="24" rx="6" fill="#6366f1" fill-opacity="0.7" />
  <rect x="340" y="400" width="36" height="24" rx="6" fill="#6366f1" fill-opacity="0.7" />

  <!-- Central Neural AI Eye / Play Aperture -->
  <!-- Outer Aperture Ring -->
  <circle cx="256" cy="256" r="105" stroke="url(#coreGrad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="45 25" />

  <!-- Inner Glowing Core -->
  <circle cx="256" cy="256" r="76" fill="#0b1120" stroke="#00f2fe" stroke-width="5" />

  <!-- Play / Scene Arrow Icon -->
  <polygon points="234,208 304,256 234,304" fill="url(#coreGrad)" />

  <!-- AI Neural Network Nodes & Light Trails -->
  <circle cx="155" cy="185" r="10" fill="#00f2fe" />
  <line x1="155" y1="185" x2="200" y2="225" stroke="#00f2fe" stroke-width="3" stroke-opacity="0.6" />

  <circle cx="355" cy="185" r="10" fill="#818cf8" />
  <line x1="355" y1="185" x2="310" y2="225" stroke="#818cf8" stroke-width="3" stroke-opacity="0.6" />

  <circle cx="155" cy="325" r="10" fill="#38bdf8" />
  <line x1="155" y1="325" x2="200" y2="285" stroke="#38bdf8" stroke-width="3" stroke-opacity="0.6" />

  <circle cx="355" cy="325" r="10" fill="#c084fc" />
  <line x1="355" y1="325" x2="310" y2="285" stroke="#c084fc" stroke-width="3" stroke-opacity="0.6" />
</svg>
`;

const svgPath = path.join(BUILD_DIR, 'icon.svg');
fs.writeFileSync(svgPath, svgContent);
console.log(`Generated SVG template: ${svgPath}`);

// Generate master 512x512 PNG
const masterPng = path.join(BUILD_DIR, 'icon.png');
execSync(`ffmpeg -y -i "${svgPath}" -vf "scale=512:512" "${masterPng}"`, { stdio: 'inherit' });
console.log(`Generated master 512x512 PNG: ${masterPng}`);

// Copy icon to electron and public
fs.copyFileSync(masterPng, path.join(ELECTRON_DIR, 'icon.png'));
fs.copyFileSync(masterPng, path.join(PUBLIC_DIR, 'logo.png'));

// Generate Windows .ico
const icoPath = path.join(BUILD_DIR, 'icon.ico');
execSync(`ffmpeg -y -i "${masterPng}" -vf "scale=256:256" "${icoPath}"`, { stdio: 'inherit' });
console.log(`Generated Windows ICO: ${icoPath}`);
fs.copyFileSync(icoPath, path.join(PUBLIC_DIR, 'favicon.ico'));

// Generate Linux multi-resolution icon set
const sizes = [16, 32, 48, 64, 128, 256, 512];
for (const size of sizes) {
  const destFile = path.join(ICONS_DIR, `${size}x${size}.png`);
  execSync(`ffmpeg -y -i "${masterPng}" -vf "scale=${size}:${size}" "${destFile}"`, { stdio: 'inherit' });
}
console.log('Generated Linux icon set in build/icons/');
console.log('All icons successfully created!');
