/**
 * @file publish.ts
 * @description Monorepo Production Publish Automation for Centaury Framework
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface PackagePublishTarget {
  name: string;
  dir: string;
}

const packagesToPublish: PackagePublishTarget[] = [
  { name: '@rudyrustam/core', dir: 'packages/core' },
  { name: '@rudyrustam/signals', dir: 'packages/signals' },
  { name: '@rudyrustam/ephemeral', dir: 'packages/ephemeral' },
  { name: '@rudyrustam/astra', dir: 'packages/astra' },
  { name: '@rudyrustam/sse', dir: 'packages/sse' },
  { name: '@rudyrustam/db', dir: 'packages/db' },
  { name: '@rudyrustam/auth', dir: 'packages/auth' },
  { name: '@rudyrustam/workflow', dir: 'packages/workflow' },
  { name: '@rudyrustam/agent', dir: 'packages/agent' },
  { name: '@rudyrustam/cli', dir: 'packages/cli' },
  { name: '@rudyrustam/centaury', dir: 'packages/centaury' },
];

const isDryRun = process.argv.includes('--dry-run');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Extract --otp from command line arguments if provided
let currentOtp: string | null = null;
const otpArg = process.argv.find((a) => a.startsWith('--otp='));
if (otpArg) {
  currentOtp = otpArg.split('=')[1].trim();
} else {
  const otpIdx = process.argv.indexOf('--otp');
  if (otpIdx !== -1 && process.argv[otpIdx + 1]) {
    currentOtp = process.argv[otpIdx + 1].trim();
  }
}

async function execCommand(command: string[], cwd: string): Promise<{ success: boolean; output: string }> {
  const proc = Bun.spawn(command, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  return {
    success: exitCode === 0,
    output: (stdout + '\n' + stderr).trim(),
  };
}

interface StagedPackageEntry {
  id: string;
  packageName: string;
  version: string;
  status: string;
}

async function isPackagePublishedOnNpm(pkgName: string, version: string): Promise<boolean> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}`);
    if (!res.ok) return false;
    const data = (await res.json()) as { versions?: Record<string, unknown> };
    return Boolean(data?.versions && Object.prototype.hasOwnProperty.call(data.versions, version));
  } catch {
    return false;
  }
}

function readNpmAuthToken(): string | null {
  const envToken = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN;
  if (envToken) return envToken.trim();

  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [join(process.cwd(), '.npmrc'), homeDir ? join(homeDir, '.npmrc') : ''].filter(Boolean);

  for (const rcPath of candidates) {
    if (!existsSync(rcPath)) continue;
    const raw = readFileSync(rcPath, 'utf-8');
    const registryMatch = raw.match(/\/\/registry\.npmjs\.org\/:_authToken=(.+)/);
    const genericMatch = raw.match(/^_authToken=(.+)$/m);
    const value = (registryMatch?.[1] || genericMatch?.[1] || '').trim().replace(/^["']|["']$/g, '');
    if (value && !value.startsWith('${')) {
      return value;
    }
  }
  return null;
}

function parseStagedPackages(output: string): StagedPackageEntry[] {
  if (!output) return [];
  const entries: StagedPackageEntry[] = [];
  for (const block of output.split(/\r?\n\s*\r?\n/)) {
    const id = block.match(/^id:\s*(.+)$/m)?.[1]?.trim();
    const packageName = block.match(/^package name:\s*(.+)$/m)?.[1]?.trim();
    const version = block.match(/^version:\s*(.+)$/m)?.[1]?.trim();
    const status = block.match(/^status:\s*(.+)$/m)?.[1]?.trim() || '';
    if (id && packageName && version) {
      entries.push({ id, packageName, version, status });
    }
  }
  return entries;
}

function openBrowserUrl(url: string): void {
  try {
    if (process.platform === 'win32') {
      Bun.spawn(['cmd', '/c', 'start', '', url], { stdio: ['ignore', 'ignore', 'ignore'] });
    } else if (process.platform === 'darwin') {
      Bun.spawn(['open', url], { stdio: ['ignore', 'ignore', 'ignore'] });
    } else {
      Bun.spawn(['xdg-open', url], { stdio: ['ignore', 'ignore', 'ignore'] });
    }
  } catch {
    // Non-fatal: URL is still printed to console
  }
}

async function approveStagedPackage(
  stageId: string,
  pkgName: string,
  token: string,
  cachedOtp: string | null,
  npmSession: string
): Promise<{ approved: boolean; otp: string | null; error?: string }> {
  const approveUrl = `https://registry.npmjs.org/-/stage/${stageId}/approve`;
  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'npm-auth-type': 'web',
    'npm-command': 'stage',
    'npm-session': npmSession,
    'user-agent': 'npm/12.2.2 node/v22.17.1 win32 x64 workspaces/false',
  };
  let activeOtp = cachedOtp;

  for (let attempt = 0; attempt < 3; attempt++) {
    const headers: Record<string, string> = { ...baseHeaders };
    if (activeOtp) {
      headers['npm-otp'] = activeOtp;
    }

    const res = await fetch(approveUrl, { method: 'POST', headers });
    if (res.ok) {
      return { approved: true, otp: activeOtp };
    }

    const bodyText = await res.text();
    let bodyJson: { authUrl?: string; doneUrl?: string; code?: string; error?: string } | null = null;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = null;
    }

    if (res.status === 401 && activeOtp && (!bodyJson?.authUrl || !bodyJson?.doneUrl)) {
      activeOtp = null;
      continue;
    }

    if (res.status === 401 && bodyJson?.authUrl && bodyJson?.doneUrl) {
      activeOtp = null;
      console.log(`\n  🔐 Approval 2FA required for \x1b[33m${pkgName}\x1b[0m (${stageId}).`);
      console.log(`  🌐 Opening browser: \x1b[36m${bodyJson.authUrl}\x1b[0m`);
      openBrowserUrl(bodyJson.authUrl);

      const deadline = Date.now() + 180_000;
      let retrievedOtp: string | null = null;

      while (Date.now() < deadline) {
        const doneRes = await fetch(bodyJson.doneUrl, {
          headers: baseHeaders,
        });
        if (doneRes.status === 200) {
          const doneJson = (await doneRes.json()) as { token?: string };
          if (doneJson?.token) {
            retrievedOtp = doneJson.token;
            break;
          }
          return { approved: false, otp: null, error: `Auth done endpoint returned 200 without token: ${JSON.stringify(doneJson)}` };
        }
        if (doneRes.status !== 202) {
          const doneErr = await doneRes.text();
          return { approved: false, otp: null, error: `Auth polling failed (${doneRes.status}): ${doneErr}` };
        }

        const retryAfterSec = Number(doneRes.headers.get('retry-after'));
        const delayMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? Math.min(retryAfterSec * 1000, 5000) : 1500;
        await new Promise((r) => setTimeout(r, delayMs));
      }

      if (!retrievedOtp) {
        return { approved: false, otp: null, error: `Timed out waiting for browser 2FA approval for ${pkgName}` };
      }

      activeOtp = retrievedOtp;
      continue;
    }

    return { approved: false, otp: activeOtp, error: `HTTP ${res.status}: ${bodyText}` };
  }

  return { approved: false, otp: activeOtp, error: 'Exceeded max approval retries after 2FA.' };
}

async function runPublishPipeline() {
  console.log('\n\x1b[36m🌌 CENTAURY MONOREPO PUBLISH PIPELINE\x1b[0m');
  console.log(`\x1b[90mMode: ${isDryRun ? 'DRY-RUN (Simulated)' : 'PRODUCTION (Real Publish)'}\x1b[0m\n`);

  // 0. Auto-configure npm token if provided via environment
  const envToken = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN;
  if (envToken) {
    await execCommand([npmBin, 'config', 'set', `//registry.npmjs.org/:_authToken=${envToken}`], process.cwd());
  }

  // 1. Verify npm credentials
  console.log('🔑 Step 1: Checking npm authentication...');
  const whoami = await execCommand([npmBin, 'whoami'], process.cwd());
  let loggedInUser = 'npm';
  if (!whoami.success) {
    if (envToken) {
      console.log('  \x1b[32m✓\x1b[0m Authenticated via Automation Token (skipping whoami profile check)');
    } else if (isDryRun) {
      console.log('  \x1b[33mℹ\x1b[0m Dry-run mode: continuing without active npm credentials.');
    } else {
      console.log('  \x1b[33mℹ\x1b[0m Proceeding with configured npm credentials / authToken in .npmrc');
    }
  } else {
    loggedInUser = whoami.output.split('\n')[0].trim();
    console.log(`  \x1b[32m✓\x1b[0m Logged in as: \x1b[33m${loggedInUser}\x1b[0m`);
  }

  // If live publish and no OTP provided yet, optionally prompt for OTP upfront
  if (!isDryRun && !currentOtp && process.stdin.isTTY) {
    console.log('\n\x1b[33m[2FA Check]\x1b[0m Jika akun Anda menggunakan 2FA Authenticator, masukkan 6 digit OTP.');
    console.log('\x1b[90m(Tekan ENTER untuk lewati jika tidak memiliki OTP atau menggunakan Access Token)\x1b[0m');
    const input = prompt('🔑 Masukkan 6-digit angka OTP (atau tekan Enter untuk lewati): ');
    if (input && input.trim()) {
      const cleaned = input.trim();
      if (/^\d{6}$/.test(cleaned)) {
        currentOtp = cleaned;
      } else {
        console.log(`\x1b[33m⚠️ Input bukan 6 angka, melanjutkan tanpa OTP...\x1b[0m`);
      }
    }
  }

  // 2. Run fresh build
  console.log('\n🔨 Step 2: Compiling all packages and type definitions...');
  const buildResult = await execCommand(['bun', 'run', 'scripts/build.ts'], process.cwd());
  if (!buildResult.success) {
    console.error('\x1b[31m✗ Build pipeline failed:\x1b[0m\n', buildResult.output);
    process.exit(1);
  }
  console.log('  \x1b[32m✓\x1b[0m All packages compiled successfully.');

  // 3. Track package.json backups for rollback
  const packageBackups = new Map<string, string>();

  try {
    // Read root version
    const rootPkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    const releaseVersion = rootPkg.version || '1.0.0-alpha';

    console.log(`\n📦 Step 3: Preparing package manifests (resolving workspace:* → ^${releaseVersion})...`);

    for (const pkg of packagesToPublish) {
      const pkgJsonPath = join(process.cwd(), pkg.dir, 'package.json');
      if (!existsSync(pkgJsonPath)) continue;

      const originalRaw = readFileSync(pkgJsonPath, 'utf-8');
      packageBackups.set(pkgJsonPath, originalRaw);

      const json = JSON.parse(originalRaw);

      // Replace workspace:* in dependencies
      let modified = false;
      for (const depType of ['dependencies', 'peerDependencies', 'devDependencies'] as const) {
        const deps = json[depType];
        if (deps && typeof deps === 'object') {
          for (const [depName, depVer] of Object.entries(deps)) {
            if (typeof depVer === 'string' && depVer.startsWith('workspace:')) {
              deps[depName] = `^${releaseVersion}`;
              modified = true;
            }
          }
        }
      }

      // Ensure normalized repository URL
      if (json.repository && typeof json.repository === 'object') {
        json.repository.url = 'git+https://github.com/roedyrustam/centaury.git';
      }

      if (modified) {
        writeFileSync(pkgJsonPath, JSON.stringify(json, null, 2) + '\n');
        console.log(`  \x1b[32m✓\x1b[0m Resolved workspace dependencies in \x1b[35m${pkg.name}\x1b[0m`);
      }
    }

    // 4. Publish each package
    console.log(`\n🚀 Step 4: Publishing packages to npmjs registry...`);
    const bunxBin = process.platform === 'win32' ? 'bunx.exe' : 'bunx';
    let stagedCount = 0;

    // Pre-check currently staged packages so already-staged versions are not re-uploaded
    const stageListPre = isDryRun
      ? { success: false, output: '' }
      : await execCommand([bunxBin, 'npm@latest', 'stage', 'list'], process.cwd());
    const preStagedEntries = parseStagedPackages(stageListPre.output);

    for (const pkg of packagesToPublish) {
      const pkgDir = join(process.cwd(), pkg.dir);
      if (!existsSync(pkgDir)) continue;

      if (!isDryRun && (await isPackagePublishedOnNpm(pkg.name, releaseVersion))) {
        console.log(`  \x1b[32m✓\x1b[0m ${pkg.name}@${releaseVersion} is already published live on npm. Skipping.`);
        continue;
      }

      const alreadyStaged = preStagedEntries.some(
        (entry) => entry.packageName === pkg.name && entry.version === releaseVersion
      );
      if (alreadyStaged) {
        console.log(`  \x1b[33mℹ\x1b[0m ${pkg.name}@${releaseVersion} is already staged on npm. Skipping upload.`);
        continue;
      }

      let published = false;
      let attempts = 0;

      while (!published && attempts < 3) {
        attempts++;
        const publishArgs = [npmBin, 'publish', '--access', 'public', '--tag', 'latest'];
        if (isDryRun) {
          publishArgs.push('--dry-run');
        }
        if (currentOtp) {
          publishArgs.push(`--otp=${currentOtp}`);
        }

        console.log(`  📦 Publishing \x1b[33m${pkg.name}\x1b[0m (${pkg.dir})...`);
        let result = await execCommand(publishArgs, pkgDir);

        if (result.success) {
          console.log(`  \x1b[32m✓\x1b[0m \x1b[32mSuccessfully published ${pkg.name}\x1b[0m`);
          published = true;
        } else {
          // If already published at this exact version, don't break automated pipeline
          if (
            result.output.includes('cannot publish over the previously published versions') ||
            result.output.includes('is already published') ||
            result.output.includes('EPUBLISHCONFLICT')
          ) {
            console.log(`  \x1b[33mℹ\x1b[0m ${pkg.name}@${releaseVersion} is already published on npm. Skipping.`);
            published = true;
            break;
          }

          // Fallback to `npm stage publish` when token is restricted to staged publishing
          if (
            result.output.includes('E_STAGE_REQUIRED') ||
            result.output.includes('can only publish to a staging area') ||
            result.output.includes('npm stage publish')
          ) {
            console.log(`  \x1b[33mℹ\x1b[0m Token requires staged publishing (E_STAGE_REQUIRED). Running \`npm stage publish\` for ${pkg.name}...`);
            const stageArgs = [bunxBin, 'npm@latest', 'stage', 'publish', '.', '--access', 'public', '--tag', 'latest'];
            if (isDryRun) {
              stageArgs.push('--dry-run');
            }
            if (currentOtp) {
              stageArgs.push(`--otp=${currentOtp}`);
            }

            const stageResult = await execCommand(stageArgs, pkgDir);
            if (
              stageResult.success ||
              stageResult.output.includes('has been staged') ||
              stageResult.output.includes('(staged)')
            ) {
              const stageSummary = stageResult.output
                .split('\n')
                .filter((line) => line.includes('staged') || line.includes('stage '))
                .slice(-3)
                .join('\n');
              console.log(`  \x1b[32m✓\x1b[0m \x1b[32mSuccessfully staged ${pkg.name}\x1b[0m`);
              if (stageSummary) {
                console.log(`    \x1b[90m${stageSummary.replace(/\n/g, '\n    ')}\x1b[0m`);
              }
              stagedCount++;
              published = true;
              break;
            }

            if (
              stageResult.output.includes('cannot publish over the previously published versions') ||
              stageResult.output.includes('is already published') ||
              stageResult.output.includes('EPUBLISHCONFLICT')
            ) {
              console.log(`  \x1b[33mℹ\x1b[0m ${pkg.name}@${releaseVersion} is already published or staged on npm. Skipping.`);
              published = true;
              break;
            }

            result = stageResult;
          }

          // Check if error is OTP related
          if (result.output.includes('EOTP') || result.output.includes('one-time password') || result.output.includes('OTP')) {
            console.log(`\n\x1b[33m⚠️  OTP diperlukan atau telah kedaluwarsa untuk ${pkg.name}.\x1b[0m`);
            const newOtp = process.stdin.isTTY ? prompt(`🔑 Masukkan 6-digit angka OTP baru untuk ${pkg.name}: `) : null;
            if (newOtp && /^\d{6}$/.test(newOtp.trim())) {
              currentOtp = newOtp.trim();
              continue; // retry loop with new OTP
            } else {
              console.error('\x1b[31m✗ Input OTP tidak valid (harus 6 angka).\x1b[0m');
            }
          }

          console.error(`  \x1b[31m✗ Failed to publish ${pkg.name}:\x1b[0m\n${result.output}`);
          if (result.output.includes('Two-factor authentication or granular access token with bypass 2fa enabled is required')) {
            console.error(
              '\n\x1b[33m⚠️  Kebijakan keamanan npm mewajibkan 2FA atau Granular Access Token (Bypass 2FA) untuk publish:\x1b[0m\n' +
                `  1. Buat Granular Access Token di https://www.npmjs.com/settings/${loggedInUser}/tokens (Read & write + centang "Bypass two-factor authentication"), lalu jalankan:\n` +
                '     $env:NPM_TOKEN="npm_xxx"; bun run release:publish\n' +
                `  2. Atau aktifkan 2FA di https://www.npmjs.com/settings/${loggedInUser}/profile, lalu jalankan:\n` +
                '     bun run scripts/publish.ts --otp=<6-digit-otp>\n'
            );
          }
          if (!isDryRun) {
            throw new Error(`Publish failed at ${pkg.name}`);
          }
          break;
        }
      }
    }

    if (!isDryRun) {
      let currentStaged = stagedCount > 0
        ? parseStagedPackages((await execCommand([bunxBin, 'npm@latest', 'stage', 'list'], process.cwd())).output)
        : preStagedEntries;

      const pendingApprovals = packagesToPublish
        .map((pkg) => {
          const match = currentStaged.find(
            (entry) => entry.packageName === pkg.name && entry.version === releaseVersion
          );
          return match ? { pkg, entry: match } : null;
        })
        .filter((item): item is { pkg: PackagePublishTarget; entry: StagedPackageEntry } => item !== null);

      if (pendingApprovals.length > 0) {
        console.log(`\n🔐 Step 5: Approving ${pendingApprovals.length} staged package(s) on npm...`);
        const npmToken = readNpmAuthToken();
        if (!npmToken) {
          throw new Error('Could not find npm _authToken in environment or .npmrc to approve staged packages.');
        }

        let cachedWebOtp: string | null = currentOtp;
        const sharedNpmSession = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

        for (const { pkg, entry } of pendingApprovals) {
          let activeEntry = entry;
          if (activeEntry.status === 'validating') {
            console.log(`  ⏳ Waiting for npm validation on ${pkg.name} (${activeEntry.id})...`);
            for (let w = 0; w < 10 && activeEntry.status === 'validating'; w++) {
              await new Promise((r) => setTimeout(r, 2000));
              const refreshed = parseStagedPackages(
                (await execCommand([bunxBin, 'npm@latest', 'stage', 'list'], process.cwd())).output
              );
              const found = refreshed.find((e) => e.id === activeEntry.id);
              if (found) activeEntry = found;
            }
          }

          console.log(`  🚀 Approving \x1b[33m${pkg.name}@${releaseVersion}\x1b[0m (${activeEntry.id})...`);
          const approval = await approveStagedPackage(activeEntry.id, pkg.name, npmToken, cachedWebOtp, sharedNpmSession);
          if (!approval.approved) {
            throw new Error(`Stage approval failed for ${pkg.name} (${activeEntry.id}): ${approval.error}`);
          }
          cachedWebOtp = approval.otp;
          console.log(`  \x1b[32m✓\x1b[0m Approved and published \x1b[32m${pkg.name}@${releaseVersion}\x1b[0m (stage ${activeEntry.id})!`);
        }
      }
    }

    console.log(`\n\x1b[32m✨ All packages published successfully to https://www.npmjs.com/~${loggedInUser} !\x1b[0m\n`);
  } finally {
    // 5. Always restore package.json files so git repo remains clean
    console.log('🔄 Cleaning up and restoring local workspace manifests...');
    for (const [filePath, originalContent] of packageBackups.entries()) {
      writeFileSync(filePath, originalContent);
    }
    console.log('  \x1b[32m✓\x1b[0m Workspace restored cleanly.\n');
  }
}

runPublishPipeline().catch((err) => {
  console.error('\n\x1b[31m[Publish Pipeline Error]\x1b[0m', err.message);
  process.exit(1);
});
