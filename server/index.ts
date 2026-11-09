import { Database } from 'bun:sqlite';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { BlockList, isIP } from 'node:net';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import webpush from 'web-push';

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dir, 'data');
const UPLOAD_DIR = join(DATA_DIR, 'uploads');
// 本番では https://famitree-api.5seg.top を設定。フロントが別オリジンなので画像URLを絶対化するため
const PUBLIC_URL = process.env.PUBLIC_URL ?? '';
// `https://*.famitree.pages.dev` のようにサブドメインのワイルドカードも書ける (Pages のプレビュー用)。認証は Cookie ではなく Bearer token なので許可しても CSRF にならない
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim());
const originAllowed = (origin: string) =>
  ALLOWED_ORIGINS.some((a) => {
    const i = a.indexOf('*.');
    return i < 0 ? a === origin : origin.startsWith(a.slice(0, i)) && origin.endsWith(a.slice(i + 1)) && !origin.slice(a.slice(0, i).length, -a.slice(i + 1).length).includes('/');
  });
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
// デコード前に弾くピクセル上限。クライアントは長辺1600pxに縮小するので十分な余裕がある
const MAX_PHOTO_PIXELS = 40_000_000;
// 1ユーザーが登録できる Push 購読の上限。超過時は最古を削除して入替える
const MAX_SUBS_PER_USER = 5;

// 写真 URL の署名鍵。未設定なら起動時に一時鍵を生成する（再起動で URL が変わるので本番は必ず設定）
const UPLOAD_SIGNING_KEY = process.env.UPLOAD_SIGNING_KEY
  || (() => {
    console.warn('UPLOAD_SIGNING_KEY is not set; using an ephemeral key (photo URLs change on restart)');
    return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  })();
const UPLOAD_URL_TTL = 12 * 3600; // 署名付き写真 URL の有効期限（秒）
const UPLOAD_URL_STEP = 3600; // exp を丸める単位。同じ時間帯は同じ URL になりブラウザキャッシュが効く
const uploadSig = (path: string, exp: number) =>
  createHmac('sha256', UPLOAD_SIGNING_KEY).update(`${path}.${exp}`).digest('base64url');
const signedUploadUrl = (path: string) => {
  const exp = Math.floor(Date.now() / 1000 / UPLOAD_URL_STEP) * UPLOAD_URL_STEP + UPLOAD_URL_TTL;
  return `${PUBLIC_URL}${path}?exp=${exp}&sig=${uploadSig(path, exp)}`;
};

const pushEnabled = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (pushEnabled) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'https://famitree-api.5seg.top',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

mkdirSync(UPLOAD_DIR, { recursive: true });
const db = new Database(join(DATA_DIR, 'famitree.db'), { create: true, strict: true });
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');
db.run(`
-- 家族グループ
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tree_level INTEGER DEFAULT 1,
  tree_status TEXT DEFAULT 'growing', -- 'thriving' | 'growing' | 'wilting' | 'hibernating'
  streak_days INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- 以下は仕様への追加
  exp INTEGER NOT NULL DEFAULT 0,
  invite_code TEXT NOT NULL UNIQUE
);
-- ユーザー
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  last_watered_at DATETIME,
  -- 以下は仕様への追加
  role TEXT NOT NULL,
  avatar TEXT NOT NULL, -- 絵文字アバター
  token_hash TEXT NOT NULL UNIQUE,
  token_expires_at DATETIME, -- スライディング有効期限。使うたび延長する
  is_admin INTEGER NOT NULL DEFAULT 0, -- 家族の管理者。除名と権限変更ができる
  removed_at DATETIME, -- 除名済み。行は残して写真や水やりの作者名を保つ
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id)
);
-- 水やりログ
CREATE TABLE IF NOT EXISTS watering_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  watered_date TEXT NOT NULL, -- 'YYYY-MM-DD' (JST)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (family_id) REFERENCES families(id),
  UNIQUE (user_id, watered_date) -- 1日1回
);
CREATE INDEX IF NOT EXISTS watering_logs_family ON watering_logs (family_id, watered_date);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('photo', 'wood')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  rotate INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nudges (
  from_user TEXT NOT NULL REFERENCES users(id),
  to_user TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('nudge', 'heart')),
  sent_date TEXT NOT NULL,
  PRIMARY KEY (from_user, to_user, kind, sent_date)
);
-- 操作ログ（検証用）。内容は記録せず、種別と経過時間だけを残す
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT,
  client_ms INTEGER NOT NULL DEFAULT 0, -- セッション開始からの経過ミリ秒
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS events_family ON events (family_id, created_at);
`);

// 既存 DB へのカラム追加（CREATE TABLE IF NOT EXISTS では反映されないため）
const userCols = db.query<{ name: string }, []>('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('is_admin')) db.run('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
if (!userCols.includes('removed_at')) db.run('ALTER TABLE users ADD COLUMN removed_at DATETIME');
if (!userCols.includes('token_expires_at')) {
  db.run('ALTER TABLE users ADD COLUMN token_expires_at DATETIME');
  // 既存ユーザーは全員失効させないよう、移行時に TTL ぶん延長しておく
  db.run("UPDATE users SET token_expires_at = datetime('now', '+90 days') WHERE token_expires_at IS NULL");
}
// 端末を失ったときに戻るための復旧コード。ハッシュだけを保存する
if (!userCols.includes('recovery_hash')) db.run('ALTER TABLE users ADD COLUMN recovery_hash TEXT');
if (!userCols.includes('recovery_issued_at')) db.run('ALTER TABLE users ADD COLUMN recovery_issued_at DATETIME');
db.run('CREATE UNIQUE INDEX IF NOT EXISTS users_recovery_hash ON users (recovery_hash)');

// 家族単位の緊急用キー（管理者が端末も自分の復旧コードも失った場合の最後の手段）
const familyCols = db.query<{ name: string }, []>('PRAGMA table_info(families)').all().map((c) => c.name);
if (!familyCols.includes('recovery_hash')) db.run('ALTER TABLE families ADD COLUMN recovery_hash TEXT');
if (!familyCols.includes('recovery_issued_at')) db.run('ALTER TABLE families ADD COLUMN recovery_issued_at DATETIME');
// 連続日の2つ目の数字。streak_days は「その日にだれかが水をやった日」の連続、
// full_streak_days は「その日に在籍していた全員がそろった日」の連続。
// 人数が多い家族では後者が伸びないので、両方を持つ
if (!familyCols.includes('full_streak_days')) db.run('ALTER TABLE families ADD COLUMN full_streak_days INTEGER DEFAULT 0');
db.run('CREATE UNIQUE INDEX IF NOT EXISTS families_recovery_hash ON families (recovery_hash)');
// 管理者がいない家族（既存データ）は、最初のメンバーを管理者にする
db.run(`UPDATE users SET is_admin = 1 WHERE removed_at IS NULL AND rowid IN (
  SELECT MIN(u.rowid) FROM users u
  WHERE u.removed_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM users a WHERE a.family_id = u.family_id AND a.is_admin = 1 AND a.removed_at IS NULL)
  GROUP BY u.family_id
)`);

type User = { id: string; family_id: string; name: string; role: string; avatar: string; is_admin: number; recovery_issued_at?: string | null };
type AuthUser = User & { token_expires_at: string | null };
type Family = { id: string; name: string; tree_level: number; tree_status: string; streak_days: number; full_streak_days: number; exp: number; invite_code: string; recovery_issued_at?: string | null };
type ArtifactRow = {
  id: string;
  type: string;
  title: string;
  content: string;
  x: number;
  y: number;
  rotate: number;
  created_at: string;
  author: string;
  author_avatar: string;
  author_role: string;
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const DAY_MS = 86_400_000;
// トークンのスライディング有効期限（最終利用からこの日数）
const TOKEN_TTL_DAYS = 90;
const TOKEN_TTL_MS = TOKEN_TTL_DAYS * DAY_MS;
const jstDate = (ms = Date.now()) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

const hashToken = (token: string) => new Bun.CryptoHasher('sha256').update(token).digest('hex');
const newToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
// 紛らわしい 0/O/1/I/L を除いた31文字 × 8桁
// ponytail: 招待コード総当たりへのレート制限なし。公開規模が大きくなったら /api/join に制限を入れる
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newInviteCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');

// 復旧コード: 端末を失ったときに同じ参加者として戻るための合言葉。Crockford base32 の 12桁 = 60bit。
// 4桁ずつ区切って見せ、DB にはハッシュだけを残す（DB が漏れても他人の端末を乗っ取れない）
const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_LENGTH = 12;
const newRecoveryCode = () => {
  const chars = Array.from(crypto.getRandomValues(new Uint8Array(RECOVERY_LENGTH)), (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
  return chars.match(/.{4}/g)!.join('-');
};
// 打ち間違いを吸収する。小文字・空白・区切りは捨て、紛らわしい O/I/L/U は生成側の文字に寄せる
const normalizeRecoveryCode = (raw: string) =>
  raw.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
// トークンと用途が混ざらないよう、ハッシュの前に接頭辞を付ける
const recoveryHash = (code: string) => hashToken(`recovery:${normalizeRecoveryCode(code)}`);

// 復旧コードの総当たり対策。60bit なので現実的には破れないが、ログを汚さない程度に絞る
const recoveryAttempts = new Map<string, { n: number; until: number }>();
function guardRecovery(req: Request) {
  if (recoveryAttempts.size > 5000) recoveryAttempts.clear();
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const now = Date.now();
  const rec = recoveryAttempts.get(ip);
  if (!rec || now > rec.until) {
    recoveryAttempts.set(ip, { n: 1, until: now + 60_000 });
    return;
  }
  if (++rec.n > 10) throw new HttpError(429, 'too many attempts');
}

const AVATAR_COLORS = [
  'bg-emerald-100 border-emerald-300 text-emerald-800',
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-amber-100 border-amber-300 text-amber-800',
  'bg-rose-100 border-rose-300 text-rose-800',
  'bg-violet-100 border-violet-300 text-violet-800',
  'bg-sky-100 border-sky-300 text-sky-800',
];

function str(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${field} is required`);
  const s = v.trim();
  if ([...s].length > max) throw new HttpError(400, `${field} is too long (max ${max})`);
  return s;
}

// 今日または昨日から遡って、連続して記録がある日数
function streakOf(datesDesc: string[], today: string): number {
  if (!datesDesc.length || daysBetween(datesDesc[0], today) > 1) return 0;
  let n = 1;
  while (n < datesDesc.length && daysBetween(datesDesc[n], datesDesc[n - 1]) === 1) n++;
  return n;
}

// 家族の連続日数は2つ持つ。
//  - any:  その日にだれか1人でも水をやった日が連続した数
//  - full: その日に在籍していた全員がそろった日が連続した数
// 人数の多い家族では full が伸びない（実際の9人家族は毎日だれかが押しても full は0）。
// だから片方だけでなく両方を出す。今日がまだ未完了なだけなら、その日は未確定として昨日までの記録を保つ。
// ponytail: 日ごとに1件ずつ遡って数える。家族は小さいので十分。長寿家族が増えたら SQL の再帰でまとめる
function familyStreak(familyId: string, today: string): { any: number; full: number } {
  const watered = new Map(q.dailyWaterers.all(familyId).map((r) => [r.d, r.n]));
  if (!watered.size) return { any: 0, full: 0 };
  const spans = q.memberSpans.all(familyId);
  const required = (d: string) => spans.filter((s) => s.joined <= d && (!s.left || s.left > d)).length;
  let any = 0;
  let full = 0;
  let anyDone = false;
  let fullDone = false;
  for (let i = 0; !anyDone || !fullDone; i++) {
    const d = jstDate(Date.now() - i * DAY_MS);
    const need = required(d);
    if (!need) break; // その日はまだメンバーがいない
    const got = watered.get(d) ?? 0;
    if (!anyDone) {
      if (got >= 1) any++;
      else if (i > 0) anyDone = true; // 今日がゼロなだけなら、昨日までの連続を見せる
    }
    if (!fullDone) {
      if (got >= need) full++;
      else if (i > 0) fullDone = true;
    }
  }
  return { any, full };
}

// 最終水やりからの経過日数で決まる状態。誰かが水やりすれば冬眠から即復活する
function treeStatus(lastDate: string | null, today: string) {
  if (!lastDate) return 'growing';
  const d = daysBetween(lastDate, today);
  if (d === 0) return 'thriving';
  if (d <= 2) return 'growing';
  if (d < 14) return 'wilting';
  return 'hibernating';
}

function displayDate(createdAtUtc: string, today: string): string {
  const jst = jstDate(Date.parse(createdAtUtc + 'Z'));
  const time = new Date(Date.parse(createdAtUtc + 'Z') + 9 * 3_600_000).toISOString().slice(11, 16);
  const d = daysBetween(jst, today);
  if (d === 0) return `今日 ${time}`;
  if (d === 1) return `昨日 ${time}`;
  return `${d}日前`;
}

// 木に吊るすのは投稿から24時間。過ぎたものはアルバムに移り、投稿から30日で消える
const HANGING_HOURS = 24;
const ALBUM_DAYS = 30;

const q = {
  userByToken: db.query<AuthUser, [string]>('SELECT id, family_id, name, role, avatar, is_admin, token_expires_at, recovery_issued_at FROM users WHERE token_hash = ? AND removed_at IS NULL'),
  userByRecovery: db.query<AuthUser, [string]>('SELECT id, family_id, name, role, avatar, is_admin, token_expires_at, recovery_issued_at FROM users WHERE recovery_hash = ? AND removed_at IS NULL'),
  family: db.query<Family, [string]>('SELECT * FROM families WHERE id = ?'),
  familyByInvite: db.query<Family, [string]>('SELECT * FROM families WHERE invite_code = ?'),
  familyByRecovery: db.query<Family, [string]>('SELECT * FROM families WHERE recovery_hash = ?'),
  setFamilyRecovery: db.query('UPDATE families SET recovery_hash = ?, recovery_issued_at = CURRENT_TIMESTAMP WHERE id = ?'),
  userById: db.query<User, [string, string]>('SELECT id, family_id, name, role, avatar, is_admin FROM users WHERE id = ? AND family_id = ? AND removed_at IS NULL'),
  adminCount: db.query<{ n: number }, [string]>('SELECT COUNT(*) AS n FROM users WHERE family_id = ? AND is_admin = 1 AND removed_at IS NULL'),
  setAdmin: db.query('UPDATE users SET is_admin = ? WHERE id = ?'),
  setRecovery: db.query('UPDATE users SET recovery_hash = ?, recovery_issued_at = CURRENT_TIMESTAMP WHERE id = ?'),
  rotateToken: db.query(`UPDATE users SET token_hash = ?, token_expires_at = datetime('now', '+${TOKEN_TTL_DAYS} days') WHERE id = ?`),
  removeUser: db.query('UPDATE users SET removed_at = CURRENT_TIMESTAMP WHERE id = ?'),
  deleteUserSubs: db.query('DELETE FROM push_subscriptions WHERE user_id = ?'),
  lastFamilyDate: db.query<{ d: string | null }, [string]>('SELECT MAX(watered_date) AS d FROM watering_logs WHERE family_id = ?'),
  members: db.query<User, [string]>('SELECT id, family_id, name, role, avatar, is_admin FROM users WHERE family_id = ? AND removed_at IS NULL ORDER BY created_at, rowid'),
  userDates: db.query<{ watered_date: string }, [string]>('SELECT watered_date FROM watering_logs WHERE user_id = ? ORDER BY watered_date DESC'),
  dailyWaterers: db.query<{ d: string; n: number }, [string]>('SELECT watered_date AS d, COUNT(DISTINCT user_id) AS n FROM watering_logs WHERE family_id = ? GROUP BY watered_date'),
  memberSpans: db.query<{ joined: string; left: string | null }, [string]>(`SELECT date(created_at, '+9 hours') AS joined, CASE WHEN removed_at IS NOT NULL THEN date(removed_at, '+9 hours') END AS left FROM users WHERE family_id = ?`),
  recentArtifacts: db.query<ArtifactRow, [string]>(`
    SELECT a.*, u.name AS author, u.avatar AS author_avatar, u.role AS author_role
    FROM artifacts a JOIN users u ON u.id = a.user_id
    WHERE a.family_id = ? AND a.created_at >= datetime('now', '-${ALBUM_DAYS} days')
    ORDER BY a.created_at DESC, a.rowid DESC`),
  expiredArtifacts: db.query<Pick<ArtifactRow, 'type' | 'content'>, [string]>(
    `SELECT type, content FROM artifacts WHERE family_id = ? AND created_at < datetime('now', '-${ALBUM_DAYS} days')`),
  deleteExpired: db.query(
    `DELETE FROM artifacts WHERE family_id = ? AND created_at < datetime('now', '-${ALBUM_DAYS} days')`),
  expiredArtifactsAll: db.query<Pick<ArtifactRow, 'type' | 'content'>, []>(
    `SELECT type, content FROM artifacts WHERE created_at < datetime('now', '-${ALBUM_DAYS} days')`),
  deleteExpiredAll: db.query(
    `DELETE FROM artifacts WHERE created_at < datetime('now', '-${ALBUM_DAYS} days')`),
  insertFamily: db.query('INSERT INTO families (id, name, invite_code) VALUES (?, ?, ?)'),
  insertUser: db.query(`INSERT INTO users (id, family_id, name, role, avatar, token_hash, token_expires_at, is_admin, recovery_hash, recovery_issued_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+${TOKEN_TTL_DAYS} days'), ?, ?, CURRENT_TIMESTAMP)`),
  insertWatering: db.query('INSERT OR IGNORE INTO watering_logs (id, user_id, family_id, watered_date) VALUES (?, ?, ?, ?)'),
  touchUser: db.query('UPDATE users SET last_watered_at = CURRENT_TIMESTAMP WHERE id = ?'),
  extendToken: db.query(`UPDATE users SET token_expires_at = datetime('now', '+${TOKEN_TTL_DAYS} days') WHERE id = ?`),
  updateTree: db.query('UPDATE families SET tree_level = ?, exp = ?, tree_status = ?, streak_days = ?, full_streak_days = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  insertArtifact: db.query('INSERT INTO artifacts (id, family_id, user_id, type, title, content, x, y, rotate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  upsertSub: db.query(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
    ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`),
  subsOf: db.query<{ endpoint: string; p256dh: string; auth: string }, [string]>('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?'),
  subOwner: db.query<{ user_id: string }, [string]>(`SELECT s.user_id FROM push_subscriptions s JOIN users u ON u.id = s.user_id
    WHERE s.endpoint = ? AND u.removed_at IS NULL AND u.token_expires_at > datetime('now')`),
  subEndpoints: db.query<{ endpoint: string }, [string]>('SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY rowid'),
  deleteSub: db.query('DELETE FROM push_subscriptions WHERE endpoint = ?'),
  insertNudge: db.query('INSERT OR IGNORE INTO nudges (from_user, to_user, kind, sent_date) VALUES (?, ?, ?, ?)'),
  insertEvent: db.query('INSERT INTO events (id, family_id, user_id, session_id, kind, detail, client_ms) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  eventsOut: db.query<any, []>(`
    SELECT e.session_id, e.kind, e.detail, e.client_ms, e.created_at,
           e.family_id, f.name AS family_name, u.name AS member_name
    FROM events e JOIN families f ON f.id = e.family_id JOIN users u ON u.id = e.user_id
    WHERE e.family_id LIKE 'verify-%'
    ORDER BY e.created_at, e.rowid`),
};

// 水やりが無いまま日が経つと tree_status / streak_days が変わるので、読み出し時に保存値を更新する（日次バッチの代わり）
function refreshTree(familyId: string, today: string): Family {
  const f = q.family.get(familyId)!;
  const status = treeStatus(q.lastFamilyDate.get(familyId)!.d, today);
  const { any, full } = familyStreak(familyId, today);
  if (status !== f.tree_status || any !== f.streak_days || full !== f.full_streak_days) {
    q.updateTree.run(f.tree_level, f.exp, status, any, full, f.id);
    return { ...f, tree_status: status, streak_days: any, full_streak_days: full };
  }
  return f;
}

// 期限切れの削除は読み出しのついでに行う。Bun サーバーには cron が無いため
function purgeExpiredArtifacts(familyId: string) {
  const expired = q.expiredArtifacts.all(familyId);
  q.deleteExpired.run(familyId);
  for (const a of expired) {
    if (a.type !== 'photo') continue;
    // 待つと state() を async にする必要があり、同期呼び出しの経路が壊れる。ファイル削除は失敗しても致命的でない
    unlink(join(UPLOAD_DIR, basename(a.content))).catch(() => {});
  }
}

// アプリを開かない家族の写真も30日で消えるよう、起動時にも全家族ぶん掃除する
async function purgeAllExpiredArtifacts() {
  const expired = q.expiredArtifactsAll.all();
  q.deleteExpiredAll.run();
  for (const a of expired) {
    if (a.type === 'photo') await unlink(join(UPLOAD_DIR, basename(a.content))).catch(() => {});
  }
}

function state(me: User & { recovery_issued_at?: string | null }) {
  purgeExpiredArtifacts(me.family_id);
  const today = jstDate();
  const family = refreshTree(me.family_id, today);
  const members = q.members.all(family.id).map((u, i) => {
    const dates = q.userDates.all(u.id).map((r) => r.watered_date);
    // プライバシー: 時刻は返さず、今日水やりしたかどうかだけ返す
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      avatar: u.avatar,
      avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
      wateredToday: dates[0] === today,
      streak: streakOf(dates, today),
      isCurrentUser: u.id === me.id,
      isAdmin: !!u.is_admin,
    };
  });
  // 木に吊るすかアルバムかは経過時間だけで決まる。行は1回だけマップしてから振り分ける
  const hangingSince = Date.now() - HANGING_HOURS * 3_600_000;
  const rows = q.recentArtifacts.all(family.id).map((a) => ({
    at: Date.parse(a.created_at + 'Z'),
    item: {
      id: a.id,
      type: a.type,
      author: a.author,
      authorAvatar: a.author_avatar,
      authorRole: a.author_role,
      date: displayDate(a.created_at, today),
      title: a.title,
      content: a.type === 'photo' ? signedUploadUrl(a.content) : a.content,
      coords: { x: a.x, y: a.y, rotate: a.rotate },
    },
  }));
  const hanging = rows.filter((r) => r.at >= hangingSince).slice(0, 20);
  const hangingIds = new Set(hanging.map((r) => r.item.id));
  const artifacts = hanging.map((r) => r.item);
  const album = rows.filter((r) => !hangingIds.has(r.item.id)).map((r) => r.item);
  return {
    family: {
      name: family.name,
      inviteCode: family.invite_code,
      level: family.tree_level,
      exp: family.exp,
      treeState: family.tree_status,
      streak: family.streak_days,
      fullStreak: family.full_streak_days,
      hasRecoveryKey: !!family.recovery_issued_at,
    },
    me: { id: me.id, name: me.name, isAdmin: !!me.is_admin, hasRecovery: !!me.recovery_issued_at },
    members,
    artifacts,
    album,
  };
}

function createUser(familyId: string, body: any, isAdmin = false) {
  const token = newToken();
  const recoveryCode = newRecoveryCode();
  q.insertUser.run(
    crypto.randomUUID(),
    familyId,
    str(body.name, 'name', 20),
    str(body.role, 'role', 20),
    str(body.avatar, 'avatar', 8),
    hashToken(token),
    isAdmin ? 1 : 0,
    recoveryHash(recoveryCode),
  );
  // 復旧コードはここでしか平文を持てないので、返して画面に出しきる
  return { token, recoveryCode };
}

const createFamily = db.transaction((body: any) => {
  const id = crypto.randomUUID();
  q.insertFamily.run(id, str(body.familyName, 'familyName', 30), newInviteCode());
  // 家族を作った人が管理者になる
  return createUser(id, body, true);
});

const water = db.transaction((me: User) => {
  const today = jstDate();
  if (!q.insertWatering.run(crypto.randomUUID(), me.id, me.family_id, today).changes) return null;
  q.touchUser.run(me.id);
  const f = q.family.get(me.family_id)!;
  // 連続日数は2つ。any は「だれかが押した日」、full は「全員そろった日」
  const { any: streak, full: fullStreak } = familyStreak(me.family_id, today);
  const exp = f.exp + 30;
  const level = f.tree_level + Math.floor(exp / 100);
  q.updateTree.run(level, exp % 100, 'thriving', streak, fullStreak, f.id);
  // レベルが上がったときだけ新しいレベルを返す（1回の水やりで二段階は上がらない）
  return level > f.tree_level ? level : null;
});

function randomCoords() {
  return [25 + Math.floor(Math.random() * 50), 35 + Math.floor(Math.random() * 35), Math.floor(Math.random() * 12) - 6];
}

// 受信画像をサーバ側でデコード→縮小→JPEG再エンコードする。爆弾・ポリグロット・EXIF(GPS等)をまとめて除去
async function sanitizePhoto(bytes: Uint8Array): Promise<Buffer> {
  try {
    return await sharp(bytes, { limitInputPixels: MAX_PHOTO_PIXELS })
      .rotate() // EXIF の向きを反映。メタデータは出力に引き継がない
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new HttpError(415, 'photo must be a valid JPEG');
  }
}

// 導入前にアップロードされた写真の EXIF(GPS等) を除去する。メタデータが残るものだけ再エンコードするので再実行しても劣化しない
async function stripExistingPhotos() {
  for (const name of readdirSync(UPLOAD_DIR)) {
    if (!/^[0-9a-f-]{36}\.jpg$/.test(name)) continue;
    const path = join(UPLOAD_DIR, name);
    try {
      const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
      const meta = await sharp(bytes, { limitInputPixels: MAX_PHOTO_PIXELS }).metadata();
      if (!meta.exif && !meta.icc && !meta.xmp && !meta.iptc) continue;
      await Bun.write(`${path}.tmp`, await sanitizePhoto(bytes));
      renameSync(`${path}.tmp`, path);
    } catch (e) {
      console.error('strip failed', name, e);
    }
  }
}

async function addArtifact(me: User, req: Request) {
  const [x, y, rotate] = randomCoords();
  if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'file is required');
    if (file.size > MAX_PHOTO_BYTES) throw new HttpError(413, 'photo is too large (max 5MB)');
    const title = str(form.get('title') || '日常のひとこま', 'title', 24);
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Content-Type は信用せず、JPEG マジックで早期拒否したうえで必ず再エンコードする
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new HttpError(415, 'photo must be JPEG');
    const jpeg = await sanitizePhoto(bytes);
    const name = `${crypto.randomUUID()}.jpg`;
    await Bun.write(join(UPLOAD_DIR, name), jpeg);
    q.insertArtifact.run(crypto.randomUUID(), me.family_id, me.id, 'photo', title, `/uploads/${name}`, x, y, rotate);
  } else {
    const body = await json(req);
    if (body.type !== 'wood') throw new HttpError(400, 'type must be wood (photos use multipart)');
    q.insertArtifact.run(crypto.randomUUID(), me.family_id, me.id, 'wood', '木製プレート', str(body.content, 'content', 20), x, y, rotate);
  }
}

// SSRF 対策: Push endpoint は公開 Push サービス想定なので、私網・ループバック・リンクローカル等を拒否する
// ponytail: 検証時と送信時で DNS が変わる rebinding までは塞がない。厳密化するなら解決 IP に固定して接続する
const blockedAddrs = new BlockList();
for (const [net, prefix, family] of [
  ['0.0.0.0', 8, 'ipv4'], ['10.0.0.0', 8, 'ipv4'], ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'], ['169.254.0.0', 16, 'ipv4'], ['172.16.0.0', 12, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'], ['192.0.2.0', 24, 'ipv4'], ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'], ['198.51.100.0', 24, 'ipv4'], ['203.0.113.0', 24, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'], ['240.0.0.0', 4, 'ipv4'],
  ['::', 128, 'ipv6'], ['::1', 128, 'ipv6'], ['fc00::', 7, 'ipv6'],
  ['fe80::', 10, 'ipv6'], ['ff00::', 8, 'ipv6'],
] as const) {
  blockedAddrs.addSubnet(net, prefix, family);
}

const isBlockedIp = (addr: string) => {
  const s = addr.replace(/^\[|\]$/g, '');
  return blockedAddrs.check(s, isIP(s) === 6 ? 'ipv6' : 'ipv4');
};

// 登録・送信の両方で検証し、内部向け endpoint を保存・送信させない
async function assertPublicEndpoint(endpoint: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new HttpError(400, 'invalid endpoint');
  }
  if (url.protocol !== 'https:') throw new HttpError(400, 'endpoint must be https');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new HttpError(400, 'endpoint host not allowed');
    return;
  }
  const addrs = await lookup(host, { all: true }).catch(() => null);
  if (!addrs?.length || addrs.some((a) => isBlockedIp(a.address))) {
    throw new HttpError(400, 'endpoint host not allowed');
  }
}

async function sendPush(userId: string, payload: { title: string; body: string }) {
  if (!pushEnabled) return;
  await Promise.all(
    q.subsOf.all(userId).map(async (s) => {
      try {
        await assertPublicEndpoint(s.endpoint);
      } catch {
        q.deleteSub.run(s.endpoint); // 既存の不正 endpoint は掃除する
        return;
      }
      return webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload))
        .catch((e) => {
          if (e.statusCode === 404 || e.statusCode === 410) q.deleteSub.run(s.endpoint);
          else console.error('push failed', e.statusCode ?? e, e.body ?? '');
        });
    }),
  );
}

// 木のレベルが上がったときだけ、水やりした本人以外の家族に知らせる（本人はその場で演出を見ている）
async function notifyLevelUp(me: User, level: number) {
  await Promise.all(
    q.members
      .all(me.family_id)
      .filter((u) => u.id !== me.id)
      .map((u) =>
        sendPush(u.id, {
          title: `🌳 木がレベル${level}に育ちました`,
          body: `${me.avatar} ${me.name}さんの水やりで、家族の木が大きくなりました`,
        }),
      ),
  );
}

async function nudge(me: User, body: any) {
  const kind = body.kind;
  if (kind !== 'nudge' && kind !== 'heart') throw new HttpError(400, 'kind must be nudge or heart');
  if (!Array.isArray(body.to) || !body.to.length) throw new HttpError(400, 'to is required');
  const message = kind === 'nudge' ? str(body.message, 'message', 40) : '温かい見守りエールが届きました';
  const today = jstDate();
  const members = new Map(state(me).members.map((m) => [m.id, m]));
  let sent = 0;
  for (const to of body.to) {
    const target = members.get(to);
    if (!target || target.isCurrentUser) throw new HttpError(400, 'invalid recipient');
    // 水やり済みの人への催促は送らない。同じ相手への同種の通知は1日1回まで
    if (kind === 'nudge' && target.wateredToday) continue;
    if (!q.insertNudge.run(me.id, to, kind, today).changes) continue;
    await sendPush(to, { title: `${me.avatar} ${me.name}さんから`, body: message });
    sent++;
  }
  return { sent };
}

// クライアントの操作ログ。1リクエスト最大 60 件、種別と経過時間だけを受け取る
const MAX_EVENTS_PER_POST = 60;
function trackEvents(me: User, body: any) {
  const sessionId = str(body.sessionId, 'sessionId', 64);
  if (!Array.isArray(body.events)) throw new HttpError(400, 'events must be an array');
  for (const e of body.events.slice(0, MAX_EVENTS_PER_POST)) {
    const kind = str(e?.kind, 'kind', 40);
    const detail = e?.detail == null ? null : str(e.detail, 'detail', 200);
    const ms = Math.max(0, Math.min(86_400_000, Math.round(Number(e?.t) || 0)));
    q.insertEvent.run(crypto.randomUUID(), me.family_id, me.id, sessionId, kind, detail, ms);
  }
}

function requireAdmin(me: User) {
  if (!me.is_admin) throw new HttpError(403, 'admin only');
}

// 家族管理: 管理者だけが他メンバーの除名と権限変更を行える
function removeMember(me: User, body: any) {
  requireAdmin(me);
  const target = q.userById.get(str(body.id, 'id', 64), me.family_id);
  if (!target) throw new HttpError(404, 'member not found');
  if (target.id === me.id) throw new HttpError(400, 'cannot remove yourself');
  if (target.is_admin && q.adminCount.get(me.family_id)!.n <= 1) throw new HttpError(400, 'family needs at least one admin');
  // 行は残す。除名しても写真の作者名が消えず、家族の記録が台無しにならない
  q.removeUser.run(target.id);
  q.deleteUserSubs.run(target.id);
}

// 本人が家族から抜ける。自分が最後の管理者なら、次のメンバーに管理者を引き継ぐ
function leaveFamily(me: User) {
  if (me.is_admin) {
    const next = q.members.all(me.family_id).find((u) => u.id !== me.id);
    if (next) q.setAdmin.run(1, next.id);
  }
  q.removeUser.run(me.id);
  q.deleteUserSubs.run(me.id);
}

function setMemberAdmin(me: User, body: any) {
  requireAdmin(me);
  const target = q.userById.get(str(body.id, 'id', 64), me.family_id);
  if (!target) throw new HttpError(404, 'member not found');
  const admin = !!body.admin;
  if (target.is_admin && !admin && q.adminCount.get(me.family_id)!.n <= 1) throw new HttpError(400, 'family needs at least one admin');
  q.setAdmin.run(admin ? 1 : 0, target.id);
}

async function json(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
}

function auth(req: Request): User {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  const user = token && q.userByToken.get(hashToken(token));
  if (!user) throw new HttpError(401, 'unauthorized');
  const expires = user.token_expires_at ? Date.parse(user.token_expires_at + 'Z') : 0;
  const now = Date.now();
  if (!expires || expires <= now) throw new HttpError(401, 'unauthorized');
  // スライディング延長。最後の延長から1日以上経ったときだけ書き込み、更新を1日1回程度に抑える
  if (expires - now < TOKEN_TTL_MS - DAY_MS) q.extendToken.run(user.id);
  return user;
}

async function route(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const key = `${req.method} ${pathname}`;

  if (req.method === 'GET' && pathname.startsWith('/uploads/')) {
    const name = pathname.slice('/uploads/'.length);
    if (!/^[0-9a-f-]{36}\.jpg$/.test(name)) throw new HttpError(404, 'not found');
    // <img> に Authorization を付けられないため、URL 側の HMAC 署名と有効期限で認可する
    const params = new URL(req.url).searchParams;
    const exp = Number(params.get('exp'));
    const sig = params.get('sig') ?? '';
    const expected = uploadSig(`/uploads/${name}`, exp);
    const sigOk = sig.length === expected.length
      && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000) || !sigOk) {
      throw new HttpError(403, 'forbidden');
    }
    const file = Bun.file(join(UPLOAD_DIR, name));
    if (!(await file.exists())) throw new HttpError(404, 'not found');
    // キャッシュ寿命を署名の残り時間に合わせる（immutable にすると失効後もブラウザキャッシュが返る）
    const maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
    return new Response(file, {
      headers: { 'cache-control': `private, max-age=${maxAge}`, 'x-content-type-options': 'nosniff' },
    });
  }

  switch (key) {
    case 'POST /api/families':
      return Response.json(createFamily(await json(req)), { status: 201 });
    case 'POST /api/join': {
      const body = await json(req);
      const family = q.familyByInvite.get(str(body.inviteCode, 'inviteCode', 8).toUpperCase());
      if (!family) throw new HttpError(404, 'invite code not found');
      return Response.json(createUser(family.id, body), { status: 201 });
    }
    // 端末を失った人が自分の復旧コードで戻る。同じ参加者の端末は1台だけなので古いトークンは切る
    case 'POST /api/recover': {
      const body = await json(req);
      guardRecovery(req);
      const user = q.userByRecovery.get(recoveryHash(str(body.recoveryCode, 'recoveryCode', 40)));
      if (!user) throw new HttpError(404, 'recovery code not found');
      const token = newToken();
      db.transaction(() => {
        q.rotateToken.run(hashToken(token), user.id);
        q.deleteUserSubs.run(user.id);
      })();
      return Response.json({ token, name: user.name });
    }
    // 復旧コードの発行・再発行（古いコードはその場で無効になる）
    case 'POST /api/recovery/issue': {
      const me = auth(req);
      const recoveryCode = newRecoveryCode();
      q.setRecovery.run(recoveryHash(recoveryCode), me.id);
      return Response.json({ recoveryCode });
    }
    case 'POST /api/family/recovery/issue': {
      const me = auth(req);
      requireAdmin(me);
      const recoveryCode = newRecoveryCode();
      q.setFamilyRecovery.run(recoveryHash(recoveryCode), me.family_id);
      return Response.json({ recoveryCode });
    }
    // 家族の緊急用キーで入り直す。管理者として新しい端末が加わり、キーは使い捨て（新しいキーを返す）
    case 'POST /api/family/recover': {
      const body = await json(req);
      guardRecovery(req);
      const family = q.familyByRecovery.get(recoveryHash(str(body.recoveryCode, 'recoveryCode', 40)));
      if (!family) throw new HttpError(404, 'recovery code not found');
      const nextKey = newRecoveryCode();
      const created = db.transaction(() => {
        const member = createUser(family.id, body, true);
        q.setFamilyRecovery.run(recoveryHash(nextKey), family.id);
        return member;
      })();
      return Response.json({ ...created, familyRecoveryCode: nextKey }, { status: 201 });
    }
    case 'GET /api/state':
      return Response.json(state(auth(req)));
    case 'POST /api/water': {
      const me = auth(req);
      const levelUp = water(me);
      // 通知の完了で水やりの応答を待たせない（届かなくても水やり自体は成立している）
      if (levelUp) void notifyLevelUp(me, levelUp);
      return Response.json(state(me));
    }
    case 'POST /api/artifacts': {
      const me = auth(req);
      await addArtifact(me, req);
      return Response.json(state(me), { status: 201 });
    }
    case 'GET /api/push/key':
      return Response.json({ publicKey: pushEnabled ? process.env.VAPID_PUBLIC_KEY : null });
    case 'POST /api/push/subscribe': {
      const me = auth(req);
      const body = await json(req);
      const endpoint = str(body.endpoint, 'endpoint', 1000);
      await assertPublicEndpoint(endpoint);
      const owner = q.subOwner.get(endpoint);
      // 有効な他人の endpoint を奪って通知を止められないようにする。失効・除名済みの持ち主なら静かに上書きする
      if (owner && owner.user_id !== me.id) throw new HttpError(409, 'endpoint already registered');
      if (!owner) {
        const mine = q.subEndpoints.all(me.id);
        // 上限超過時は最古の購読を削除して入替（古い端末の残骸で新規登録できなくなるのを防ぐ）
        if (mine.length >= MAX_SUBS_PER_USER) {
          for (const s of mine.slice(0, mine.length - MAX_SUBS_PER_USER + 1)) q.deleteSub.run(s.endpoint);
        }
      }
      q.upsertSub.run(endpoint, me.id, str(body.keys?.p256dh, 'keys.p256dh', 200), str(body.keys?.auth, 'keys.auth', 100));
      return new Response(null, { status: 204 });
    }
    case 'POST /api/nudge':
      return Response.json(await nudge(auth(req), await json(req)));
    case 'POST /api/events':
      trackEvents(auth(req), await json(req));
      return new Response(null, { status: 204 });
    case 'GET /api/verify/events': {
      // 検証時にだけ有効。キー未設定なら存在しないことにする
      const key = process.env.VERIFY_KEY;
      if (!key || new URL(req.url).searchParams.get('key') !== key) throw new HttpError(404, 'not found');
      const rows = q.eventsOut.all();
      return Response.json(rows, { headers: { 'cache-control': 'no-store' } });
    }
    case 'POST /api/members/remove': {
      const me = auth(req);
      removeMember(me, await json(req));
      return Response.json(state(me));
    }
    case 'POST /api/members/admin': {
      const me = auth(req);
      setMemberAdmin(me, await json(req));
      return Response.json(state(me));
    }
    case 'POST /api/members/leave':
      leaveFamily(auth(req));
      return new Response(null, { status: 204 });
  }
  throw new HttpError(404, 'not found');
}

// 全 API レスポンスに付けるセキュリティヘッダ。CORP は Pages からの画像読み込みを壊すので付けない
function cors(req: Request, res: Response) {
  const origin = req.headers.get('origin');
  if (origin && originAllowed(origin)) {
    res.headers.set('access-control-allow-origin', origin);
    res.headers.set('vary', 'origin');
  }
  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('x-frame-options', 'DENY');
  res.headers.set('referrer-policy', 'no-referrer');
  res.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  res.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  res.headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  return res;
}

await stripExistingPhotos();
await purgeAllExpiredArtifacts();

const server = Bun.serve({
  port: PORT,
  maxRequestBodySize: MAX_PHOTO_BYTES + 64 * 1024,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return cors(req, new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-max-age': '86400',
        },
      }));
    }
    try {
      return cors(req, await route(req));
    } catch (e) {
      if (e instanceof HttpError) return cors(req, Response.json({ error: e.message }, { status: e.status }));
      console.error(e);
      return cors(req, Response.json({ error: 'internal error' }, { status: 500 }));
    }
  },
});

console.log(`FamiTree API listening on ${server.url} (push ${pushEnabled ? 'enabled' : 'disabled'})`);
