import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const packagingDirectory = path.join(projectRoot, 'horizon-pwa');
const templatePath = path.join(packagingDirectory, 'twa-manifest.template.json');
const outputPath = path.join(packagingDirectory, 'twa-manifest.json');

const host = process.env.HORIZON_PWA_HOST?.trim() || 'polyhydra.openblocks.app';
const packageId = process.env.HORIZON_PACKAGE_ID?.trim() || 'com.ixxyxr.polyhydra';
const keystorePath = process.env.HORIZON_KEYSTORE_PATH?.trim();
const keyAlias = process.env.HORIZON_KEY_ALIAS?.trim() || 'android';
const applicationId = process.env.HORIZON_APP_ID?.trim() || '0';
const certificateFingerprint = process.env.HORIZON_CERT_FINGERPRINT?.trim();

const missing = [
  ['HORIZON_KEYSTORE_PATH', keystorePath],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

if (host.includes('://') || host.includes('/')) {
  throw new Error('HORIZON_PWA_HOST must be a bare HTTPS hostname without a scheme or path.');
}

if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageId)) {
  throw new Error('HORIZON_PACKAGE_ID must be a lowercase reverse-domain Android package ID.');
}

if (!path.isAbsolute(keystorePath)) {
  throw new Error('HORIZON_KEYSTORE_PATH must be an absolute path.');
}

const manifest = JSON.parse(await readFile(templatePath, 'utf8'));
manifest.packageId = packageId;
manifest.applicationId = applicationId;
manifest.host = host;
manifest.startUrl = '/';
manifest.iconUrl = `https://${host}/icons/icon-512.png`;
manifest.maskableIconUrl = `https://${host}/icons/icon-512-maskable.png`;
manifest.webManifestUrl = `https://${host}/manifest.webmanifest`;
manifest.signingKey = {
  path: keystorePath,
  alias: keyAlias,
};

if (certificateFingerprint) {
  manifest.fingerprints = [certificateFingerprint];
}

await mkdir(packagingDirectory, {recursive: true});
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);

if (certificateFingerprint) {
  const assetLinksDirectory = path.join(projectRoot, 'public', '.well-known');
  const assetLinksPath = path.join(assetLinksDirectory, 'assetlinks.json');
  const assetLinks = [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageId,
      sha256_cert_fingerprints: [certificateFingerprint],
    },
  }];

  await mkdir(assetLinksDirectory, {recursive: true});
  await writeFile(assetLinksPath, `${JSON.stringify(assetLinks, null, 2)}\n`);
  console.log(`Wrote ${assetLinksPath}`);
} else {
  console.log('HORIZON_CERT_FINGERPRINT is not set; assetlinks.json was not generated.');
}
