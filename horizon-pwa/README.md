# Meta Horizon 2D PWA packaging

This directory contains the non-secret configuration used to package Polyhydra
as a windowed Meta Horizon OS application.

The hosted PWA must be live over HTTPS before Bubblewrap can generate the
Android wrapper. Generate the machine-specific `twa-manifest.json` after
choosing the permanent package ID, host, Horizon App ID, and signing key:

```powershell
$env:HORIZON_PWA_HOST = 'example.com'
$env:HORIZON_PACKAGE_ID = 'com.example.polyhydra'
$env:HORIZON_KEYSTORE_PATH = 'C:\secure\polyhydra.keystore'
$env:HORIZON_KEY_ALIAS = 'android'
$env:HORIZON_APP_ID = '0'
$env:HORIZON_CERT_FINGERPRINT = 'AA:BB:...'
npm run horizon:configure
```

Omit `HORIZON_CERT_FINGERPRINT` until the signing certificate exists. When it
is supplied, the command also generates `public/.well-known/assetlinks.json`.

Keep the signing keystore outside the deployable `public/` directory. The
keystore, APK, AAB, and Gradle build output are ignored by Git.

The important 2D settings are:

- `display`: `standalone`
- `orientation`: `landscape`
- `horizonOSAppMode`: `2D`
- no automatic WebXR session request

Once the live manifest and signing details are available:

```powershell
npm install --global @meta-quest/bubblewrap-cli
Set-Location horizon-pwa
bubblewrap update
bubblewrap build
```

After signing, publish the generated Digital Asset Links statement at
`https://<PWA_HOST>/.well-known/assetlinks.json`. It must contain the exact
Android package ID and SHA-256 fingerprint of the signing certificate.
