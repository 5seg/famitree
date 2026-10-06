import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import webpush from 'web-push';

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dir, 'data');
const UPLOAD_DIR = join(DATA_DIR, 'uploads');
// 本番では https://famitree-api.5seg.top を設定。フロントが別オリジンなので画像URLを絶対化するため
const PUBLIC_URL = process.env.PUBLIC_URL ?? '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',');
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

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
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS watering_logs (
  user_id TEXT NOT NULL REFERENCES users(id),
  family_id TEXT NOT NULL REFERENCES families(id),
  watered_date TEXT NOT NULL, -- JST 'YYYY-MM-DD'
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, watered_date)
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
`);

type User = { id: string; family_id: string; name: string; role: string; avatar: string };
type Family = { id: string; name: string; level: number; exp: number; invite_code: string };

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const DAY_MS = 86_400_000;
const jstDate = (ms = Date.now()) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

const hashToken = (token: string) => new Bun.CryptoHasher('sha256').update(token).digest('hex');
const newToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
// 紛らわしい 0/O/1/I/L を除いた31文字 × 8桁
// ponytail: 招待コード総当たりへのレート制限なし。公開規模が大きくなったら /api/join に制限を入れる
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newInviteCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');

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

// 保存せず最終水やりからの経過日数で決める。誰かが水やりすれば冬眠から即復活する
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

const q = {
  userByToken: db.query<User, [string]>('SELECT id, family_id, name, role, avatar FROM users WHERE token_hash = ?'),
  family: db.query<Family, [string]>('SELECT id, name, level, exp, invite_code FROM families WHERE id = ?'),
  familyByInvite: db.query<Family, [string]>('SELECT id, name, level, exp, invite_code FROM families WHERE invite_code = ?'),
  members: db.query<User, [string]>('SELECT id, family_id, name, role, avatar FROM users WHERE family_id = ? ORDER BY created_at, rowid'),
  userDates: db.query<{ watered_date: string }, [string]>('SELECT watered_date FROM watering_logs WHERE user_id = ? ORDER BY watered_date DESC'),
  familyDates: db.query<{ watered_date: string }, [string]>('SELECT DISTINCT watered_date FROM watering_logs WHERE family_id = ? ORDER BY watered_date DESC'),
  artifacts: db.query<any, [string]>(`
    SELECT a.*, u.name AS author, u.avatar AS author_avatar, u.role AS author_role
    FROM artifacts a JOIN users u ON u.id = a.user_id
    WHERE a.family_id = ? ORDER BY a.created_at DESC, a.rowid DESC LIMIT 20`),
  insertFamily: db.query('INSERT INTO families (id, name, invite_code) VALUES (?, ?, ?)'),
  insertUser: db.query('INSERT INTO users (id, family_id, name, role, avatar, token_hash) VALUES (?, ?, ?, ?, ?, ?)'),
  insertWatering: db.query('INSERT OR IGNORE INTO watering_logs (user_id, family_id, watered_date) VALUES (?, ?, ?)'),
  updateExp: db.query('UPDATE families SET level = ?, exp = ? WHERE id = ?'),
  insertArtifact: db.query('INSERT INTO artifacts (id, family_id, user_id, type, title, content, x, y, rotate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  upsertSub: db.query(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
    ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`),
  subsOf: db.query<{ endpoint: string; p256dh: string; auth: string }, [string]>('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?'),
  deleteSub: db.query('DELETE FROM push_subscriptions WHERE endpoint = ?'),
  insertNudge: db.query('INSERT OR IGNORE INTO nudges (from_user, to_user, kind, sent_date) VALUES (?, ?, ?, ?)'),
};

function state(me: User) {
  const today = jstDate();
  const family = q.family.get(me.family_id)!;
  const familyDates = q.familyDates.all(family.id).map((r) => r.watered_date);
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
    };
  });
  const artifacts = q.artifacts.all(family.id).map((a) => ({
    id: a.id,
    type: a.type,
    author: a.author,
    authorAvatar: a.author_avatar,
    authorRole: a.author_role,
    date: displayDate(a.created_at, today),
    title: a.title,
    content: a.type === 'photo' ? PUBLIC_URL + a.content : a.content,
    coords: { x: a.x, y: a.y, rotate: a.rotate },
  }));
  return {
    family: {
      name: family.name,
      inviteCode: family.invite_code,
      level: family.level,
      exp: family.exp,
      treeState: treeStatus(familyDates[0] ?? null, today),
      streak: streakOf(familyDates, today),
    },
    members,
    artifacts,
  };
}

function createUser(familyId: string, body: any) {
  const token = newToken();
  q.insertUser.run(
    crypto.randomUUID(),
    familyId,
    str(body.name, 'name', 20),
    str(body.role, 'role', 20),
    str(body.avatar, 'avatar', 8),
    hashToken(token),
  );
  return token;
}

const createFamily = db.transaction((body: any) => {
  const id = crypto.randomUUID();
  q.insertFamily.run(id, str(body.familyName, 'familyName', 30), newInviteCode());
  return createUser(id, body);
});

const water = db.transaction((me: User) => {
  const { changes } = q.insertWatering.run(me.id, me.family_id, jstDate());
  if (!changes) return;
  const f = q.family.get(me.family_id)!;
  const exp = f.exp + 30;
  q.updateExp.run(f.level + Math.floor(exp / 100), exp % 100, f.id);
});

function randomCoords() {
  return [25 + Math.floor(Math.random() * 50), 35 + Math.floor(Math.random() * 35), Math.floor(Math.random() * 12) - 6];
}

async function addArtifact(me: User, req: Request) {
  const [x, y, rotate] = randomCoords();
  if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'file is required');
    if (file.size > MAX_PHOTO_BYTES) throw new HttpError(413, 'photo is too large (max 5MB)');
    const title = str(form.get('title') || '日常のひとこま', 'title', 30);
    const bytes = new Uint8Array(await file.arrayBuffer());
    // クライアントで JPEG に再エンコードして送る前提。中身で判定し Content-Type は信用しない
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new HttpError(415, 'photo must be JPEG');
    const name = `${crypto.randomUUID()}.jpg`;
    await Bun.write(join(UPLOAD_DIR, name), bytes);
    q.insertArtifact.run(crypto.randomUUID(), me.family_id, me.id, 'photo', title, `/uploads/${name}`, x, y, rotate);
  } else {
    const body = await json(req);
    if (body.type !== 'wood') throw new HttpError(400, 'type must be wood (photos use multipart)');
    q.insertArtifact.run(crypto.randomUUID(), me.family_id, me.id, 'wood', '木製プレート', str(body.content, 'content', 20), x, y, rotate);
  }
}

async function sendPush(userId: string, payload: { title: string; body: string }) {
  if (!pushEnabled) return;
  await Promise.all(
    q.subsOf.all(userId).map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload))
        .catch((e) => {
          if (e.statusCode === 404 || e.statusCode === 410) q.deleteSub.run(s.endpoint);
          else console.error('push failed', e.statusCode ?? e, e.body ?? '');
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
  return user;
}

async function route(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const key = `${req.method} ${pathname}`;

  if (req.method === 'GET' && pathname.startsWith('/uploads/')) {
    const name = pathname.slice('/uploads/'.length);
    // ponytail: 推測不能な UUID のファイル名だけで保護している（<img> に token を付けられないため）。必要になったら署名付きURLに
    const file = /^[0-9a-f-]{36}\.jpg$/.test(name) && Bun.file(join(UPLOAD_DIR, name));
    if (!file || !(await file.exists())) throw new HttpError(404, 'not found');
    return new Response(file, { headers: { 'cache-control': 'public, max-age=31536000, immutable' } });
  }

  switch (key) {
    case 'POST /api/families':
      return Response.json({ token: createFamily(await json(req)) }, { status: 201 });
    case 'POST /api/join': {
      const body = await json(req);
      const family = q.familyByInvite.get(str(body.inviteCode, 'inviteCode', 8).toUpperCase());
      if (!family) throw new HttpError(404, 'invite code not found');
      return Response.json({ token: createUser(family.id, body) }, { status: 201 });
    }
    case 'GET /api/state':
      return Response.json(state(auth(req)));
    case 'POST /api/water': {
      const me = auth(req);
      water(me);
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
      q.upsertSub.run(str(body.endpoint, 'endpoint', 1000), me.id, str(body.keys?.p256dh, 'keys.p256dh', 200), str(body.keys?.auth, 'keys.auth', 100));
      return new Response(null, { status: 204 });
    }
    case 'POST /api/nudge':
      return Response.json(await nudge(auth(req), await json(req)));
  }
  throw new HttpError(404, 'not found');
}

function cors(req: Request, res: Response) {
  const origin = req.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.headers.set('access-control-allow-origin', origin);
    res.headers.set('vary', 'origin');
  }
  return res;
}

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
