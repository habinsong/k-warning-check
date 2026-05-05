import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tauriDir = path.join(root, 'tauri-app');
const appName = 'K-WarningCheck Desktop.app';
const dmgName = 'K-WarningCheck Desktop_0.1.0_aarch64.dmg';
const sourceApp = path.join(tauriDir, 'target/release/bundle/macos', appName);
const outputDir = path.join(root, 'build/mac');
const outputApp = path.join(outputDir, appName);
const outputDmg = path.join(outputDir, dmgName);
const stagingDir = path.join(root, 'build/.mac-dmg-staging');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function remove(target) {
  rmSync(target, { force: true, recursive: true });
}

run('npm', ['run', 'build:desktop-renderer', '-w', 'main']);
run('cargo', ['tauri', 'build', '--bundles', 'app'], { cwd: tauriDir });

if (!existsSync(sourceApp)) {
  throw new Error(`Missing macOS app bundle: ${sourceApp}`);
}

run('xattr', ['-cr', sourceApp]);
run('codesign', ['--force', '--deep', '--sign', '-', sourceApp]);
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', sourceApp]);

remove(outputDir);
mkdirSync(outputDir, { recursive: true });
cpSync(sourceApp, outputApp, { recursive: true });
run('xattr', ['-cr', outputApp]);
run('codesign', ['--force', '--deep', '--sign', '-', outputApp]);
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', outputApp]);

remove(stagingDir);
mkdirSync(stagingDir, { recursive: true });
cpSync(outputApp, path.join(stagingDir, appName), { recursive: true });
symlinkSync('/Applications', path.join(stagingDir, 'Applications'));

remove(outputDmg);
run('hdiutil', [
  'create',
  '-volname',
  'K-WarningCheck Desktop',
  '-srcfolder',
  stagingDir,
  '-ov',
  '-format',
  'UDZO',
  outputDmg,
]);
run('xattr', ['-cr', outputDmg]);
run('codesign', ['--force', '--sign', '-', outputDmg]);
run('codesign', ['--verify', '--verbose=2', outputDmg]);

remove(stagingDir);
