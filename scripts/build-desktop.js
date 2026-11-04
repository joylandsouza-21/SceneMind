const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const STANDALONE_DIR = path.join(ROOT_DIR, '.next', 'standalone');

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const item of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('=== Step 1: Building Next.js Standalone Bundle ===');
execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });

console.log('=== Step 2: Syncing Static Assets to Standalone Output ===');
// Next.js standalone requires static assets copied explicitly
const staticSrc = path.join(ROOT_DIR, '.next', 'static');
const staticDest = path.join(STANDALONE_DIR, '.next', 'static');
console.log(`Copying: ${staticSrc} -> ${staticDest}`);
copyRecursiveSync(staticSrc, staticDest);

const publicSrc = path.join(ROOT_DIR, 'public');
const publicDest = path.join(STANDALONE_DIR, 'public');
if (fs.existsSync(publicSrc)) {
  console.log(`Copying: ${publicSrc} -> ${publicDest}`);
  copyRecursiveSync(publicSrc, publicDest);
}

// Ensure test data and uploaded videos are NOT packed into desktop installer
const standaloneStorage = path.join(STANDALONE_DIR, 'storage');
const standaloneData = path.join(STANDALONE_DIR, 'data');
if (fs.existsSync(standaloneStorage)) {
  console.log(`Cleaning test storage from standalone build: ${standaloneStorage}`);
  fs.rmSync(standaloneStorage, { recursive: true, force: true });
}
if (fs.existsSync(standaloneData)) {
  console.log(`Cleaning test data from standalone build: ${standaloneData}`);
  fs.rmSync(standaloneData, { recursive: true, force: true });
}

// Pass any CLI arguments to electron-builder (e.g. --linux deb, --win nsis)
const builderArgs = process.argv.slice(2).join(' ');
console.log(`=== Step 3: Running electron-builder ${builderArgs} ===`);
execSync(`npx electron-builder ${builderArgs}`, { cwd: ROOT_DIR, stdio: 'inherit' });
console.log('=== Desktop Build Complete! ===');
