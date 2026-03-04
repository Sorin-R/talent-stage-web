#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const TALENT_TYPES = [
  'Singer',
  'Dancer',
  'Rapper',
  'Comedian',
  'Actor',
  'Musician',
  'Magician',
  'Athlete',
  'Visual Artist',
  'Unique Talent',
  'Acrobat',
  'Impressionist',
  'Ventriloquist',
  'Martial Artist',
  'Variety',
  'Viewer',
];

const DEFAULTS = {
  apiBase: process.env.SEED_API_BASE || 'http://localhost:3000/api',
  users: Number(process.env.SEED_USERS || 10),
  videos: Number(process.env.SEED_VIDEOS || 100),
  password: process.env.SEED_PASSWORD || 'qawsedrf',
  emailDomain: process.env.SEED_EMAIL_DOMAIN || 'seed.local',
  usernamePrefix: process.env.SEED_USERNAME_PREFIX || 'seeduser',
  videoDir: process.env.SEED_VIDEO_DIR || './uploads/videos',
  delayMs: Number(process.env.SEED_DELAY_MS || 120),
  uploadTimeoutMs: Number(process.env.SEED_UPLOAD_TIMEOUT_MS || 300000),
};

function parseArgs(argv) {
  const out = {
    ...DEFAULTS,
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--api-base') out.apiBase = argv[++i];
    else if (a === '--users') out.users = Number(argv[++i]);
    else if (a === '--videos') out.videos = Number(argv[++i]);
    else if (a === '--password') out.password = argv[++i];
    else if (a === '--email-domain') out.emailDomain = argv[++i];
    else if (a === '--username-prefix') out.usernamePrefix = argv[++i];
    else if (a === '--video-dir') out.videoDir = argv[++i];
    else if (a === '--delay-ms') out.delayMs = Number(argv[++i]);
    else if (a === '--upload-timeout-ms') out.uploadTimeoutMs = Number(argv[++i]);
    else throw new Error(`Unknown arg: ${a}`);
  }
  return out;
}

function printHelp() {
  console.log(`Seed users and videos

Usage:
  node scripts/seed-users-videos.mjs [options]

Options:
  --api-base <url>         API base URL (default: ${DEFAULTS.apiBase})
  --users <n>              Number of users to create (default: ${DEFAULTS.users})
  --videos <n>             Number of videos to upload (default: ${DEFAULTS.videos})
  --password <text>        Password for seeded users (default: ${DEFAULTS.password})
  --email-domain <domain>  Email domain for users (default: ${DEFAULTS.emailDomain})
  --username-prefix <txt>  Username prefix (default: ${DEFAULTS.usernamePrefix})
  --video-dir <path>       Folder with source videos (default: ${DEFAULTS.videoDir})
  --delay-ms <n>           Delay between uploads (default: ${DEFAULTS.delayMs})
  --upload-timeout-ms <n>  Timeout per upload request (default: ${DEFAULTS.uploadTimeoutMs})
  --dry-run                Validate inputs and show plan only
  --help                   Show this help

Example:
  npm run seed:users-videos -- --api-base https://api.web-demo.space/api --users 10 --videos 100 --video-dir ./uploads/videos
`);
}

function normalizeApiBase(raw) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('Missing --api-base');
  if (trimmed.endsWith('/api')) return trimmed;
  return `${trimmed}/api`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectVideoFiles(videoDir) {
  const allowed = new Set(['.mp4', '.mov', '.m4v', '.webm']);
  const names = await fs.readdir(videoDir);
  const files = names
    .map((name) => path.join(videoDir, name))
    .filter((p) => allowed.has(path.extname(p).toLowerCase()));
  files.sort();
  return files;
}

function getMimeTypeForVideo(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  return 'application/octet-stream';
}

async function fileToBlob(filePath) {
  const mime = getMimeTypeForVideo(filePath);
  if (typeof fs.openAsBlob === 'function') {
    return fs.openAsBlob(filePath, { type: mime });
  }
  const buf = await fs.readFile(filePath);
  return new Blob([buf], { type: mime });
}

async function fetchJson(url, options = {}) {
  const { timeoutMs: timeoutOption, ...fetchOptions } = options;
  const timeoutMs = Number(timeoutOption || 0);
  const controller = timeoutMs > 0 ? new AbortController() : null;
  let timer = null;
  if (controller) {
    timer = setTimeout(() => controller.abort(`timeout_${timeoutMs}ms`), timeoutMs);
  }

  let res;
  try {
    res = await fetch(url, {
      ...fetchOptions,
      signal: controller?.signal,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data };
}

async function registerOrLoginUser({ apiBase, index, total, password, emailDomain, usernamePrefix }) {
  const seq = String(index + 1).padStart(2, '0');
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
  const username = `${usernamePrefix}_${stamp}_${seq}`.toLowerCase();
  const email = `${username}@${emailDomain}`.toLowerCase();
  const talent_type = TALENT_TYPES[index % TALENT_TYPES.length];
  const full_name = `Seed User ${index + 1}`;

  const registerBody = JSON.stringify({
    username,
    email,
    password,
    full_name,
    talent_type,
  });

  const reg = await fetchJson(`${apiBase}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: registerBody,
  });

  if (reg.ok && reg.data?.data?.token) {
    console.log(`[user ${index + 1}/${total}] created ${email}`);
    return {
      username,
      email,
      token: reg.data.data.token,
      talent_type,
    };
  }

  if (reg.status === 409) {
    const login = await fetchJson(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (login.ok && login.data?.data?.token) {
      console.log(`[user ${index + 1}/${total}] reused ${email}`);
      return {
        username,
        email,
        token: login.data.data.token,
        talent_type,
      };
    }
  }

  const errText = reg.data?.error || reg.data?.message || JSON.stringify(reg.data);
  throw new Error(`User ${index + 1} failed (${email}): ${errText}`);
}

async function uploadOneVideo({ apiBase, token, title, description, talent_type, filePath, timeoutMs }) {
  const form = new FormData();
  form.append('title', title);
  form.append('description', description);
  form.append('talent_type', talent_type);
  const blob = await fileToBlob(filePath);
  form.append('video', blob, path.basename(filePath));

  return fetchJson(`${apiBase}/videos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    timeoutMs,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!Number.isInteger(args.users) || args.users <= 0) throw new Error('--users must be > 0');
  if (!Number.isInteger(args.videos) || args.videos <= 0) throw new Error('--videos must be > 0');
  if (String(args.password).length < 8) throw new Error('--password must be at least 8 characters');
  if (!args.emailDomain.includes('.')) throw new Error('--email-domain must be a domain');
  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) throw new Error('--delay-ms must be >= 0');
  if (!Number.isFinite(args.uploadTimeoutMs) || args.uploadTimeoutMs <= 0) {
    throw new Error('--upload-timeout-ms must be > 0');
  }

  const apiBase = normalizeApiBase(args.apiBase);
  const videoDir = path.resolve(process.cwd(), args.videoDir);
  const sourceVideos = await collectVideoFiles(videoDir);
  if (sourceVideos.length === 0) {
    throw new Error(`No source videos found in ${videoDir}`);
  }

  console.log('Seed config');
  console.log(`- API base:      ${apiBase}`);
  console.log(`- Users:         ${args.users}`);
  console.log(`- Videos:        ${args.videos}`);
  console.log(`- Password:      ${'*'.repeat(Math.min(String(args.password).length, 12))}`);
  console.log(`- Video dir:     ${videoDir}`);
  console.log(`- Source videos: ${sourceVideos.length}`);
  console.log(`- Delay:         ${args.delayMs} ms`);
  console.log(`- Timeout:       ${args.uploadTimeoutMs} ms/upload`);

  if (args.dryRun) {
    console.log('\nDry run complete. No users/videos were created.');
    return;
  }

  const users = [];
  for (let i = 0; i < args.users; i += 1) {
    const user = await registerOrLoginUser({
      apiBase,
      index: i,
      total: args.users,
      password: args.password,
      emailDomain: args.emailDomain,
      usernamePrefix: args.usernamePrefix,
    });
    users.push(user);
  }

  let success = 0;
  let failed = 0;
  for (let i = 0; i < args.videos; i += 1) {
    const user = users[i % users.length];
    const videoPath = sourceVideos[i % sourceVideos.length];
    const title = `Seed video ${String(i + 1).padStart(3, '0')}`;
    const description = `Auto-seeded by script for load/testing (${path.basename(videoPath)})`;
    console.log(`[upload ${i + 1}/${args.videos}] start user=${user.username} file=${path.basename(videoPath)}`);
    let res;
    try {
      res = await uploadOneVideo({
        apiBase,
        token: user.token,
        title,
        description,
        talent_type: user.talent_type,
        filePath: videoPath,
        timeoutMs: args.uploadTimeoutMs,
      });
    } catch (err) {
      failed += 1;
      console.error(`[upload ${i + 1}/${args.videos}] failed: ${err?.message || err}`);
      if (args.delayMs > 0) await sleep(args.delayMs);
      continue;
    }

    if (res.ok) {
      success += 1;
      console.log(`[upload ${i + 1}/${args.videos}] ok (success=${success}, failed=${failed})`);
    } else {
      failed += 1;
      const errText = res.data?.error || res.data?.message || JSON.stringify(res.data);
      console.error(`[upload ${i + 1}/${args.videos}] failed: ${errText}`);
    }

    if (args.delayMs > 0) await sleep(args.delayMs);
  }

  console.log('\nDone');
  console.log(`- Users processed:  ${users.length}`);
  console.log(`- Videos uploaded:  ${success}`);
  console.log(`- Upload failures:  ${failed}`);
}

main().catch((err) => {
  console.error('Seed script failed:', err?.message || err);
  process.exit(1);
});
