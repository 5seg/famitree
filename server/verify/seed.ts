// 検証用の疑似家族を作る／消す。
//
//   bun run verify:seed            # 作成（既存の検証用家族は消してから作り直す）
//   bun run verify:seed --reset    # 削除だけ
//   bun run verify:seed --codes    # 作成せず、既存の招待コードを表示
//
// 作るのは 2 種類 × 6 組:
//   A: 3 人が今日もう水やり済み・写真 2 枚・一言 2 つ。連続 12 日。被験者は 4 人目として入る
//   B: 3 日前で止まった家族。枯れている。被験者が押すとその場で復活する
//
// family_id は必ず `verify-` で始まる。reset はこの prefix の行だけを消す。
import { Database } from 'bun:sqlite';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dir, '..', 'data');
const UPLOAD_DIR = join(DATA_DIR, 'uploads');
const PHOTO_DIR = join(import.meta.dir, 'photos');
const DAY_MS = 86_400_000;
const VARIANTS = 6;

const db = new Database(join(DATA_DIR, 'famitree.db'), { create: true, strict: true });
db.run('PRAGMA foreign_keys = ON');

const jstDate = (ms = Date.now()) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
const utcStamp = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const daysAgo = (n: number) => Date.now() - n * DAY_MS;

// 招待コードの文字種。サーバー側と同じ（0/O/1/I/L を除く）
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ALPHABET[b % ALPHABET.length]).join('');

// users.token_hash は NOT NULL UNIQUE。シードのメンバーは実際にはログインしないので捨ててよい
const fakeTokenHash = () => `seed-${crypto.randomUUID()}`;

type Seed = {
  letter: 'A' | 'B';
  label: string;
  families: string[];
  members: [string, string, string][];
  stoppedDaysAgo: number;
};

const GROUPS: Seed[] = [
  {
    letter: 'A',
    label: '満開の家族',
    stoppedDaysAgo: 0, // 今日まで全員続いている
    families: ['ひだまり家', 'さくら家', 'なのはな家', 'こもれび家', 'あおば家', 'やまぶき家'],
    members: [
      ['お父さん', '会社員', '👨'],
      ['お母さん', '主婦', '👩'],
      ['妹', '中学生', '👧'],
    ],
  },
  {
    letter: 'B',
    label: '止まった家族',
    stoppedDaysAgo: 3,
    families: ['しおかぜ家', 'つきみ家', 'かえで家', 'ゆきどけ家', 'はるかぜ家', 'なつめ家'],
    members: [
      ['お父さん', '自営業', '👨'],
      ['お母さん', '看護師', '👩'],
      ['兄', '高校生', '👦'],
    ],
  },
];

type ArtifactSeed =
  | { type: 'photo'; title: string; file: string; coords: [number, number, number]; ago: number }
  | { type: 'wood'; title: string; content: string; coords: [number, number, number]; ago: number };

const ARTIFACTS: Record<'A' | 'B', ArtifactSeed[]> = {
  A: [
    { type: 'photo', title: '帰り道の夕焼け', file: 'photo-1.jpg', coords: [34, 42, -4], ago: 1 },
    { type: 'photo', title: '今日のお弁当🍱', file: 'photo-2.jpg', coords: [61, 45, 5], ago: 0 },
    { type: 'wood', title: '木製プレート', content: '期末テスト終わった！', coords: [33, 60, -3], ago: 1 },
    { type: 'wood', title: '木製プレート', content: '荷物届いたよ〜', coords: [63, 63, 4], ago: 0 },
  ],
  B: [
    { type: 'photo', title: '帰り道の夕焼け', file: 'photo-1.jpg', coords: [36, 44, -3], ago: 4 },
    { type: 'wood', title: '木製プレート', content: '今日は遅くなる', coords: [60, 60, 3], ago: 4 },
  ],
};

/** verify- で始まる家族と、それに紐づく行をすべて消す */
function reset() {
  const families = db.query<{ id: string }, []>("SELECT id FROM families WHERE id LIKE 'verify-%'").all();
  if (!families.length) return 0;
  const ids = families.map((f) => f.id);
  const ph = ids.map(() => '?').join(',');
  // 写真ファイルは行を消す前に拾う
  for (const a of db
    .query<{ content: string }, string[]>(`SELECT content FROM artifacts WHERE family_id IN (${ph}) AND type = 'photo'`)
    .all(...ids)) {
    const name = a.content.split('/').pop();
    if (name) rmSync(join(UPLOAD_DIR, name), { force: true });
  }
  db.transaction(() => {
    const userIds = `SELECT id FROM users WHERE family_id IN (${ph})`;
    db.run(`DELETE FROM events WHERE family_id IN (${ph})`, ids);
    db.run(`DELETE FROM nudges WHERE from_user IN (${userIds}) OR to_user IN (${userIds})`, [...ids, ...ids]);
    db.run(`DELETE FROM watering_logs WHERE family_id IN (${ph})`, ids);
    db.run(`DELETE FROM artifacts WHERE family_id IN (${ph})`, ids);
    db.run(`DELETE FROM push_subscriptions WHERE user_id IN (${userIds})`, ids);
    db.run(`DELETE FROM users WHERE family_id IN (${ph})`, ids);
    db.run(`DELETE FROM families WHERE id IN (${ph})`, ids);
  })();
  return ids.length;
}

function photos() {
  for (const f of ['photo-1.jpg', 'photo-2.jpg']) {
    if (!existsSync(join(PHOTO_DIR, f))) throw new Error(`写真が足りない: ${join(PHOTO_DIR, f)}`);
  }
}

function seed() {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  photos();
  const codes: { tester: number; A: string; B: string }[] = [];

  const insertFamily = db.query('INSERT INTO families (id, name, invite_code, tree_level, exp) VALUES (?, ?, ?, ?, ?)');
  const insertUser = db.query(
    `INSERT INTO users (id, family_id, name, role, avatar, token_hash, token_expires_at, is_admin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+90 days'), ?, ?)`
  );
  const insertWatering = db.query(
    'INSERT INTO watering_logs (id, user_id, family_id, watered_date, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insertArtifact = db.query(
    `INSERT INTO artifacts (id, family_id, user_id, type, title, content, x, y, rotate, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const updateTree = db.query('UPDATE families SET tree_status = ?, streak_days = ? WHERE id = ?');

  db.transaction(() => {
    for (let i = 1; i <= VARIANTS; i++) {
      const row: { tester: number; A: string; B: string } = { tester: i, A: '', B: '' };
      for (const g of GROUPS) {
        const familyId = `verify-${g.letter.toLowerCase()}-${i}`;
        const code = newCode();
        if (g.letter === 'A') row.A = code;
        else row.B = code;
        const level = g.letter === 'A' ? 3 : 2;
        const exp = g.letter === 'A' ? 65 : 40;
        insertFamily.run(familyId, g.families[i - 1], code, level, exp);

        // メンバーは 30 日前に入ったことにする。当日参加の被験者と区別するため
        const joinedAt = utcStamp(daysAgo(30));
        const memberIds = g.members.map(([name, role, avatar], k) => {
          const id = `${familyId}-m${k + 1}`;
          insertUser.run(id, familyId, name, role, avatar, fakeTokenHash(), k === 0 ? 1 : 0, joinedAt);
          return id;
        });

        // 水やり履歴: A は今日まで 12 日、B は 3 日前で止まる 8 日
        const days = g.letter === 'A' ? 15 : 8;
        const offset = g.letter === 'A' ? 0 : g.stoppedDaysAgo;
        for (let d = offset; d < offset + days; d++) {
          const date = jstDate(daysAgo(d));
          for (const mid of memberIds) {
            insertWatering.run(crypto.randomUUID(), mid, familyId, date, utcStamp(daysAgo(d)));
          }
        }

        for (const [k, a] of ARTIFACTS[g.letter].entries()) {
          const at = utcStamp(daysAgo(a.ago) + 3_600_000 * 3);
          if (a.type === 'photo') {
            const name = `${crypto.randomUUID()}.jpg`;
            copyFileSync(join(PHOTO_DIR, a.file), join(UPLOAD_DIR, name));
            insertArtifact.run(crypto.randomUUID(), familyId, memberIds[k % 3], 'photo', a.title, `/uploads/${name}`, a.coords[0], a.coords[1], a.coords[2], at);
          } else {
            insertArtifact.run(crypto.randomUUID(), familyId, memberIds[k % 3], 'wood', a.title, a.content, a.coords[0], a.coords[1], a.coords[2], at);
          }
        }

        updateTree.run(g.letter === 'A' ? 'thriving' : 'wilting', g.letter === 'A' ? 14 : 0, familyId);
      }
      codes.push(row);
    }
  })();

  return codes;
}

function existingCodes() {
  const rows = db
    .query<{ id: string; invite_code: string }, []>("SELECT id, invite_code FROM families WHERE id LIKE 'verify-%' ORDER BY id")
    .all();
  const byId = new Map(rows.map((r) => [r.id, r.invite_code]));
  const out = [];
  for (let i = 1; i <= VARIANTS; i++) {
    const a = byId.get(`verify-a-${i}`);
    const b = byId.get(`verify-b-${i}`);
    if (a && b) out.push({ tester: i, A: a, B: b });
  }
  return out;
}

const flag = process.argv[2];
if (flag === '--reset') {
  console.log(`deleted ${reset()} verify families`);
  rmSync(join(import.meta.dir, 'codes.txt'), { force: true });
} else if (flag === '--codes') {
  print(existingCodes());
} else {
  const deleted = reset();
  const codes = seed();
  console.log(`deleted ${deleted} / seeded ${codes.length * 2} families`);
  print(codes);
}

function print(codes: { tester: number; A: string; B: string }[]) {
  if (!codes.length) {
    console.log('検証用の家族が無い。`bun run verify:seed` で作る');
    return;
  }
  const lines = [
    '被験者 | 1つ目（満開の家族） | 2つ目（止まった家族）',
    '------ | ------------------ | --------------------',
    ...codes.map((c) => `#${c.tester}     | ${c.A}            | ${c.B}`),
  ];
  const text = lines.join('\n');
  console.log(`\n${text}\n`);
  const CODES_PATH = join(import.meta.dir, 'codes.txt');
  writeFileSync(CODES_PATH, `${text}\n`, 'utf8');
  console.log(`-> ${CODES_PATH} に書き出した`);
}
