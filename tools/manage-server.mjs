import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const serverPath = resolve(root, 'server.mjs');
const runtime = resolve(root, '.runtime');
const statePath = resolve(runtime, 'server.json');
const lockPath = resolve(runtime, 'manager.lock');
const logPath = resolve(runtime, 'server.log');
const url = 'http://127.0.0.1:4317/';
const checkout = createHash('sha256').update(serverPath).digest('hex');
const delay = ms => new Promise(r => setTimeout(r, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

async function status() {
  try {
    const res = await fetch(url + '__local_status', { signal: AbortSignal.timeout(1000), redirect: 'error', cache: 'no-store' });
    const value = await res.json();
    return res.ok && value.app === 'omni-continue-studio' && value.checkout === checkout ? value : null;
  } catch { return null; }
}

async function lock() {
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  try {
    const file = await open(lockPath, 'wx', 0o600);
    await file.writeFile(String(process.pid)); await file.close();
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const owner = Number(await readFile(lockPath, 'utf8'));
    if (!Number.isSafeInteger(owner) || owner <= 1 || alive(owner)) throw new Error('起動または停止を処理中です。少し待ってから状態を確認してください。');
    await unlink(lockPath); return lock();
  }
}

async function start() {
  const existing = await status();
  if (existing) {
    let saved;
    try { saved = JSON.parse(await readFile(statePath, 'utf8')); } catch {}
    if (saved?.pid === existing.pid && saved.startedAt === existing.startedAt && saved.checkout === checkout) {
      console.log(`すでに独立プロセスで起動しています。\n${url}`); return;
    }
    throw new Error('同じアプリが、この起動スクリプトの管理外で動いています。元のターミナルでControl+Cを押して停止してから「起動.command」を開いてください。管理外のプロセスは停止していません。');
  }
  const log = await open(logPath, 'a', 0o600);
  const child = spawn(process.execPath, [serverPath], {
    cwd: root, detached: true,
    stdio: ['ignore', log.fd, log.fd],
    // Deliberately avoid inheriting keys or other secrets from the invoking shell.
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', PORT: '4317' },
  });
  let launchError;
  child.once('error', error => { launchError = error; });
  child.unref(); await log.close();
  for (let i = 0; i < 60; i++) {
    if (launchError) throw new Error('サーバーを起動できませんでした。Node.jsの実行環境を確認してください。');
    const running = await status();
    if (running?.pid === child.pid) {
      await writeFile(statePath, JSON.stringify(running), { mode: 0o600 });
      console.log(`Omni Continue Studio を起動しました。\n${url}\n\n起動コマンドが終了してもサーバーは動き続けます。\n停止は「停止.command」を開いてください。Macの再起動後は再度「起動.command」を開きます。`);
      return;
    }
    if (child.pid && !alive(child.pid)) break;
    await delay(100);
  }
  throw new Error('起動を確認できませんでした。4317番ポートの競合や .runtime/server.log を確認してください。他のプロセスは停止していません。');
}

async function stop() {
  let saved;
  try { saved = JSON.parse(await readFile(statePath, 'utf8')); }
  catch { console.log('この起動スクリプトが管理するサーバーの記録はありません。'); return; }
  const running = await status();
  if (!running) {
    if (Number.isSafeInteger(saved.pid) && saved.pid > 1 && alive(saved.pid))
      throw new Error('記録したプロセスの応答を確認できないため、停止しません。他のプロセスには触れていません。');
    await unlink(statePath); console.log('管理対象のサーバーはすでに停止しています。'); return;
  }
  if (running.pid !== saved.pid || running.startedAt !== saved.startedAt || running.checkout !== saved.checkout || saved.checkout !== checkout)
    throw new Error('プロセスの識別情報が一致しないため、停止しません。他のプロセスには触れていません。');
  process.kill(running.pid, 'SIGTERM');
  for (let i = 0; i < 40; i++) {
    const current = await status();
    if (!current || current.pid !== running.pid) { await unlink(statePath); console.log('Omni Continue Studio を停止しました。'); return; }
    await delay(100);
  }
  throw new Error('停止完了を確認できませんでした。強制終了は行っていません。');
}

const action = process.argv[2] || 'status';
let locked = false;
try {
  if (action === 'status') {
    const current = await status();
    console.log(current ? `起動中: ${url}\nPID: ${current.pid}` : 'この作業先のサーバーは起動していません。');
    process.exitCode = current ? 0 : 1;
  } else if (['start', 'stop'].includes(action)) {
    await lock(); locked = true;
    await (action === 'start' ? start() : stop());
  } else throw new Error('指定できる操作は start / stop / status です。');
} catch (e) {
  console.error(e.message); process.exitCode = 1;
} finally { if (locked) await unlink(lockPath).catch(() => {}); }
