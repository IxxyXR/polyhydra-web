import {spawnSync} from 'node:child_process';
import path from 'node:path';

const accountId = '6dae4c5b015907d33fbc3b8a1f94d7b3';
const wranglerCli = path.resolve('node_modules', 'wrangler', 'bin', 'wrangler.js');

let apiToken = process.env.CLOUDFLARE_API_TOKEN;
if (!apiToken) {
  const authResult = spawnSync(process.execPath, [wranglerCli, 'auth', 'token', '--json'], {
    encoding: 'utf8',
  });
  if (authResult.status !== 0) {
    throw new Error('Unable to read the existing Wrangler OAuth token.');
  }
  apiToken = JSON.parse(authResult.stdout).token;
}

const deployResult = spawnSync(
  process.execPath,
  [wranglerCli, 'pages', 'deploy', 'dist', '--project-name', 'polyhydra', '--branch', 'main'],
  {
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: apiToken,
    },
    stdio: 'inherit',
  },
);

if (deployResult.status !== 0) {
  throw new Error(`Cloudflare Pages deployment failed with exit code ${deployResult.status}.`);
}
