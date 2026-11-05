// 検証用のデータを作る。
//
//   bun run verify:simulate              # 家族が無ければ seed してから、イベントと回答を生成
//   bun run verify:simulate --sessions 24
//   bun run verify:simulate --clear      # 生成した分だけ消す（session_id が sim- の行）
//
// 出すのは「人が触ったらこうなるはず」という机上の想定値。実測ではない。
// 乱数は固定シードなので、何度走らせても同じ数字になる（数字を資料に固定できる）。
import { Database } from 'bun:sqlite';
import { join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dir, '..', 'data');
const db = new Database(join(DATA_DIR, 'famitree.db'), { create: true, strict: true });

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const SESSIONS = Number(arg('sessions') ?? 12);
const RNG_SEED = Number(arg('seed') ?? 20261105);

// mulberry32: 同じ種なら同じ列
let s = RNG_SEED >>> 0;
const rnd = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number) => rnd() < p;
const between = (a: number, b: number) => a + rnd() * (b - a);
// 対数正規: 中央値 median 秒、ばらつき sigma
const lognormal = (median: number, sigma: number) => median * Math.exp(sigma * (Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd())));

db.run(`CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL, user_id TEXT NOT NULL, session_id TEXT NOT NULL,
  kind TEXT NOT NULL, detail TEXT, client_ms INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

if (process.argv.includes('--clear')) {
  const n = db.query<{ n: number }, []>("SELECT count(*) AS n FROM events WHERE session_id LIKE 'sim-%'").get()?.n ?? 0;
  db.run("DELETE FROM events WHERE session_id LIKE 'sim-%'");
  console.log(`deleted ${n} simulated events`);
  process.exit(0);
}

type Family = { id: string; letter: 'a' | 'b'; members: string[] };
const families = new Map<'a' | 'b', Family[]>();
for (const letter of ['a', 'b'] as const) {
  const rows = db.query<{ id: string }, []>("SELECT id FROM families WHERE id LIKE ? ORDER BY id").all(`verify-${letter}-%`);
  families.set(
    letter,
    rows.map((r) => ({
      id: r.id,
      letter,
      members: db.query<{ id: string }, [string]>('SELECT id FROM users WHERE family_id = ? ORDER BY id').all(r.id).map((u) => u.id),
    }))
  );
}
for (const [letter, list] of families) {
  if (!list.length) throw new Error(`verify-${letter}-* の家族が無い。先に \`bun run verify:seed\``);
}

// 群ごとの想定（机上の値）
const MODEL = {
  a: { press: [2.9, 0.45], watered: 0.92, artifact: [0.40, 0.48, 0.12], nudge: [0.55, 0.30, 0.15], modals: [2, 5], label: '満開の家族' },
  b: { press: [2.3, 0.40], watered: 0.97, artifact: [0.65, 0.35], nudge: [0.60, 0.40], modals: [1, 3], label: '止まった家族' },
} as const;
const MODAL_KINDS = ['info', 'artifact', 'member', 'add_content', 'nudge'];

const insert = db.query(
  `INSERT INTO events (id, family_id, user_id, session_id, kind, detail, client_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

type Frame = { t: number; kind: string; detail?: string | null };
const sessions: { letter: 'a' | 'b'; family: string; member: string; frames: Frame[] }[] = [];

for (const letter of ['a', 'b'] as const) {
  const model = MODEL[letter];
  const list = families.get(letter)!;
  for (let n = 1; n <= SESSIONS; n++) {
    const fam = list[(n - 1) % list.length];
    const frames: Frame[] = [];
    let t = Math.round(between(250, 900));
    frames.push({ t, kind: 'state_loaded', detail: letter === 'a' ? 'thriving' : 'wilting' });

    // 8割は開いてすぐ押す。2割は先に画面を覗いてから押す
    if (chance(0.2)) {
      for (let k = 0; k < Math.round(between(1, 2)); k++) {
        t += Math.round(between(1200, 4000));
        frames.push({ t, kind: 'modal_open', detail: pick(MODAL_KINDS) });
      }
    }

    // 水やりまで（開いてからの経過ミリ秒）
    t += Math.round(lognormal(model.press[0], model.press[1]) * 1000);
    frames.push({ t, kind: 'water_press' });
    if (chance(model.watered)) {
      t += Math.round(between(300, 700));
      frames.push({ t, kind: 'water_ok', detail: 'thriving' });
    }

    // 押した後はゆっくり見て回る
    for (let k = 0; k < Math.round(between(model.modals[0], model.modals[1])); k++) {
      t += Math.round(between(1500, 8000));
      frames.push({ t, kind: 'modal_open', detail: pick(MODAL_KINDS) });
    }

    const roll = rnd();
    let adds = 0;
    for (let acc = 0; adds < model.artifact.length && roll >= (acc += model.artifact[adds]); adds++);
    for (let k = 0; k < adds; k++) {
      t += Math.round(between(6000, 40000));
      frames.push({ t, kind: 'artifact_saved', detail: k === 0 ? 'photo' : 'wood' });
    }

    const nudges = chance(model.nudge[0]) ? 0 : chance(model.nudge[1]) ? 1 : 2;
    for (let k = 0; k < nudges; k++) {
      t += Math.round(between(3000, 15000));
      frames.push({ t, kind: 'nudge_sent', detail: 'heart' });
    }

    if (chance(0.25)) {
      t += Math.round(between(5000, 60000));
      frames.push({ t, kind: 'session_end', detail: pick(['hidden', 'hidden', 'close']) });
    }

    sessions.push({ letter, family: fam.id, member: pick(fam.members), frames });
  }
}

db.run("DELETE FROM events WHERE session_id LIKE 'sim-%'");
const now = Date.now();
const tx = db.transaction(() => {
  sessions.forEach((sess, i) => {
    const sid = `sim-${sess.letter}-${String(i).padStart(3, '0')}`;
    const startedAt = new Date(now - (i * 3.7 + between(0, 3)) * 3_600_000);
    for (const f of sess.frames) {
      insert.run(
        crypto.randomUUID(),
        sess.family,
        sess.member,
        sid,
        f.kind,
        f.detail ?? null,
        f.t,
        new Date(startedAt.getTime() + f.t).toISOString().slice(0, 19).replace('T', ' ')
      );
    }
  });
});
tx();

// アンケート（6人分・5件法）。群ではなくアプリ全体への回答として生成する
const ITEMS = [
  { q: 'Q4 また使いたいと思った', mu: 4.0 },
  { q: 'Q5 家族に勧めたいと思った', mu: 3.5 },
  { q: 'Q6 見張られている感じがした', mu: 2.2 },
  { q: 'Q7 木が枯れていて責められた感じがした', mu: 2.0 },
  { q: 'Q8 写真や一言を飾るのは恥ずかしかった', mu: 2.8 },
  { q: 'Q9 家族と使うと会話が増えると思う', mu: 4.2 },
  { q: 'Q10 枯れたままにしたくないと思った', mu: 4.3 },
];
const RESPONDENTS = 6;
const answers = ITEMS.map((it) => ({
  ...it,
  vals: Array.from({ length: RESPONDENTS }, () => Math.max(1, Math.min(5, Math.round(it.mu + between(-1.3, 1.3))))),
}));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log(`\n生成: ${sessions.length} セッション（${SESSIONS} × 2群） 種=${RNG_SEED}\n`);
console.log('| 質問 | 平均 | 回答 |');
console.log('|---|---|---|');
for (const a of answers) console.log(`| ${a.q} | ${mean(a.vals).toFixed(2)} | ${a.vals.join(' ')} |`);
const want = answers.filter((a) => /Q4|Q5|Q9/.test(a.q)).flatMap((a) => a.vals);
const watch = answers.filter((a) => /Q6|Q7|Q8/.test(a.q)).flatMap((a) => a.vals);
console.log(`\n- 使いたさ = ${mean(want).toFixed(2)}`);
console.log(`- 監視感・責められ感 = ${mean(watch).toFixed(2)}`);
console.log(`- 枯れたままにしたくない = ${mean(answers[6].vals).toFixed(2)}`);
console.log('\n次の行で集計を確認: bun run verify:tally\n');
