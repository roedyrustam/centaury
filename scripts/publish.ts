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
  { name: '@centaury-ai/core', dir: 'packages/core' },
  { name: '@centaury-ai/signals', dir: 'packages/signals' },
  { name: '@centaury-ai/ephemeral', dir: 'packages/ephemeral' },
  { name: '@centaury-ai/astra', dir: 'packages/astra' },
  { name: '@centaury-ai/agent', dir: 'packages/agent' },
  { name: '@centaury-ai/cli', dir: 'packages/cli' },
  { name: 'centaury', dir: 'packages/centaury' },
];

const isDryRun = process.argv.includes('--dry-run');

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

async function runPublishPipeline() {
  console.log('\n\x1b[36m🌌 CENTAURY MONOREPO PUBLISH PIPELINE\x1b[0m');
  console.log(`\x1b[90mMode: ${isDryRun ? 'DRY-RUN (Simulated)' : 'PRODUCTION (Real Publish)'}\x1b[0m\n`);

  // 1. Verify npm credentials
  console.log('🔑 Step 1: Checking npm authentication...');
  const whoami = await execCommand(['npm', 'whoami'], process.cwd());
  if (!whoami.success) {
    console.error('\x1b[31m✗ Not logged in to npm.\x1b[0m Please run `npm login` first.');
    process.exit(1);
  }
  const loggedInUser = whoami.output.split('\n')[0].trim();
  console.log(`  \x1b[32m✓\x1b[0m Logged in as: \x1b[33m${loggedInUser}\x1b[0m`);

  // If live publish and no OTP provided yet, optionally prompt for OTP upfront
  if (!isDryRun && !currentOtp) {
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

    for (const pkg of packagesToPublish) {
      const pkgDir = join(process.cwd(), pkg.dir);
      if (!existsSync(pkgDir)) continue;

      let published = false;
      let attempts = 0;

      while (!published && attempts < 3) {
        attempts++;
        const publishArgs = ['npm', 'publish', '--access', 'public'];
        if (isDryRun) {
          publishArgs.push('--dry-run');
        }
        if (currentOtp) {
          publishArgs.push(`--otp=${currentOtp}`);
        }

        console.log(`  📦 Publishing \x1b[33m${pkg.name}\x1b[0m (${pkg.dir})...`);
        const result = await execCommand(publishArgs, pkgDir);

        if (result.success) {
          console.log(`  \x1b[32m✓\x1b[0m \x1b[32mSuccessfully published ${pkg.name}\x1b[0m`);
          published = true;
        } else {
          // Check if error is OTP related
          if (result.output.includes('EOTP') || result.output.includes('one-time password') || result.output.includes('OTP')) {
            console.log(`\n\x1b[33m⚠️  OTP diperlukan atau telah kedaluwarsa untuk ${pkg.name}.\x1b[0m`);
            const newOtp = prompt(`🔑 Masukkan 6-digit angka OTP baru untuk ${pkg.name}: `);
            if (newOtp && /^\d{6}$/.test(newOtp.trim())) {
              currentOtp = newOtp.trim();
              continue; // retry loop with new OTP
            } else {
              console.error('\x1b[31m✗ Input OTP tidak valid (harus 6 angka).\x1b[0m');
            }
          }

          console.error(`  \x1b[31m✗ Failed to publish ${pkg.name}:\x1b[0m\n${result.output}`);
          if (!isDryRun) {
            throw new Error(`Publish failed at ${pkg.name}`);
          }
          break;
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
