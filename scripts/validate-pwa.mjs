import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const manifestPath = path.join(projectRoot, 'public', 'manifest.webmanifest');
const templatePath = path.join(projectRoot, 'horizon-pwa', 'twa-manifest.template.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const template = JSON.parse(await readFile(templatePath, 'utf8'));

const expectedManifestValues = {
  display: 'standalone',
  orientation: 'landscape',
  start_url: './',
  scope: './',
};

for (const [field, expected] of Object.entries(expectedManifestValues)) {
  if (manifest[field] !== expected) {
    throw new Error(`manifest.webmanifest ${field} must be ${JSON.stringify(expected)}.`);
  }
}

if (template.horizonOSAppMode !== '2D') {
  throw new Error('The Horizon package template must use horizonOSAppMode "2D".');
}

if (template.display !== 'standalone' || template.orientation !== 'landscape') {
  throw new Error('The Horizon package template must be standalone and landscape.');
}

const requiredIcons = [
  {src: './icons/icon-192.png', width: 192, height: 192, purpose: 'any'},
  {src: './icons/icon-512.png', width: 512, height: 512, purpose: 'any'},
  {src: './icons/icon-512-maskable.png', width: 512, height: 512, purpose: 'maskable'},
];

for (const expected of requiredIcons) {
  const icon = manifest.icons?.find(({src, purpose}) => (
    src === expected.src && purpose === expected.purpose
  ));
  if (!icon) {
    throw new Error(`Missing ${expected.purpose} icon ${expected.src}.`);
  }

  const iconPath = path.join(projectRoot, 'public', icon.src.replace(/^\.\//, ''));
  await access(iconPath);
  const metadata = await sharp(iconPath).metadata();
  if (metadata.width !== expected.width || metadata.height !== expected.height) {
    throw new Error(`${expected.src} must be ${expected.width}x${expected.height}.`);
  }
  if (expected.purpose === 'maskable' && metadata.hasAlpha) {
    throw new Error(`${expected.src} must be opaque and must not have an alpha channel.`);
  }
}

console.log('PWA manifest, icons, and Horizon 2D package template are valid.');
