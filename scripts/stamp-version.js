const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getCommit() {
  if (process.env.WEBUI_COMMIT_SHA) {
    return process.env.WEBUI_COMMIT_SHA.slice(0, 7);
  }
  if (process.env.GIT_COMMIT) {
    return process.env.GIT_COMMIT.slice(0, 7);
  }

  // Try reading .git directly
  try {
    const gitDir = path.resolve(__dirname, '..', '.git');
    if (fs.existsSync(gitDir)) {
      const headPath = path.join(gitDir, 'HEAD');
      if (fs.existsSync(headPath)) {
        const head = fs.readFileSync(headPath, 'utf-8').trim();
        if (!head.startsWith('ref:')) {
          return head.slice(0, 7);
        }
        const refRelative = head.slice('ref:'.length).trim();
        const refPath = path.join(gitDir, refRelative);
        if (fs.existsSync(refPath)) {
          return fs.readFileSync(refPath, 'utf-8').trim().slice(0, 7);
        }
        const packedPath = path.join(gitDir, 'packed-refs');
        if (fs.existsSync(packedPath)) {
          const packed = fs.readFileSync(packedPath, 'utf-8');
          const line = packed.split('\n').find((l) => l.includes(refRelative));
          if (line) return line.trim().split(' ')[0].slice(0, 7);
        }
      }
    }
  } catch {}

  // Try git CLI
  try {
    const stdout = execSync('git rev-parse --short HEAD', {
      timeout: 3000,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return stdout.trim();
  } catch {}

  // Fallback to existing version.json if present
  try {
    const vPath = path.resolve(__dirname, '..', 'version.json');
    if (fs.existsSync(vPath)) {
      const v = JSON.parse(fs.readFileSync(vPath, 'utf-8'));
      if (v.commit) return v.commit;
    }
  } catch {}

  return 'unknown';
}

function stamp() {
  const root = path.resolve(__dirname, '..');
  const pkgPath = path.join(root, 'package.json');
  let version = '0.1.0';
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      version = pkg.version || '0.1.0';
    } catch {}
  }

  const commit = getCommit();
  const info = {
    version,
    commit,
    builtAt: new Date().toISOString(),
  };

  const targets = [
    path.join(root, 'version.json'),
    path.join(root, 'dist', 'version.json'),
  ];

  for (const t of targets) {
    try {
      const dir = path.dirname(t);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(t, JSON.stringify(info, null, 2), 'utf-8');
      console.log(`[stamp-version] Stamped ${t}: commit=${commit}, version=${version}`);
    } catch (e) {
      console.warn(`[stamp-version] Could not stamp ${t}: ${e.message}`);
    }
  }
}

stamp();
