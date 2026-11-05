// 仲間に60分テストさせた結果を、発表に貼れる形にする（読み取り専用）。
//
//   bun run verify:material                    # 今日以降に参加した家族
//   bun run verify:material --since=2026-11-05
//   bun run verify:material --json
//
// 本番 DB に対して実行する。書き込みはしない。
// 検証用（verify-）と生成データ（sim-）は数えない。家族名・個人名は出さない。
//
// 出せるもの: 参加した世帯と人、5つのタスクに到達した人の数、初見で押すまでの秒数、
//             飾った数、届いた数、枯れから戻った回数、連続日数。
// 出せないもの: 言葉・表情・理由。それは進行役のメモと被験者シートから拾う。
import { Database } from 'bun:sqlite';
import { join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dir, '..', 'data');
const db = new Database(join(DATA_DIR, 'famitree.db'), { readonly: true });

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const day = 86_400_000;
const jst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const since = arg('since') ?? jst(new Date());
const to = arg('to') ?? jst(new Date(Date.now() + day));

const one = <T>(sql: string, ...p: unknown[]) => db.query(sql).get(...(p as never[])) as T;
const many = <T>(sql: string, ...p: unknown[]) => db.query(sql).all(...(p as never[])) as T[];

// この窓に参加した本物の家族（verify- と sim- は除く）
const FAM = `
  SELECT DISTINCT u.family_id AS id FROM users u JOIN families f ON f.id = u.family_id
  WHERE f.id NOT LIKE 'verify-%' AND u.created_at >= ? AND u.created_at < ?`;

const people = many<{ id: string; family_id: string; created_at: string }>(
  `WITH fam AS (${FAM})
   SELECT u.id, u.family_id, u.created_at FROM users u JOIN fam ON fam.id = u.family_id
   WHERE u.removed_at IS NULL ORDER BY u.created_at`,
  `${since} 00:00:00`,
  `${to} 23:59:59`
);
const families = [...new Set(people.map((p) => p.family_id))];

const waterRows = many<{ user_id: string; family_id: string; watered_date: string }>(
  `WITH fam AS (${FAM})
   SELECT w.user_id, w.family_id, w.watered_date FROM watering_logs w JOIN fam ON fam.id = w.family_id
   WHERE w.watered_date >= ? ORDER BY w.user_id, w.watered_date`,
  `${since} 00:00:00`,
  `${to} 23:59:59`,
  since
);
const artifacts = many<{ user_id: string; family_id: string; type: string }>(
  `WITH fam AS (${FAM})
   SELECT a.user_id, a.family_id, a.type FROM artifacts a JOIN fam ON fam.id = a.family_id`,
  `${since} 00:00:00`,
  `${to} 23:59:59`
);
const nudges = many<{ from_user: string; family_id: string; kind: string }>(
  `WITH fam AS (${FAM})
   SELECT n.from_user, u.family_id, n.kind FROM nudges n JOIN users u ON u.id = n.from_user
   JOIN fam ON fam.id = u.family_id`,
  `${since} 00:00:00`,
  `${to} 23:59:59`
);
const streaks = many<{ streak_days: number; tree_status: string }>(
  `WITH fam AS (${FAM}) SELECT f.streak_days, f.tree_status FROM families f JOIN fam ON fam.id = f.id`,
  `${since} 00:00:00`,
  `${to} 23:59:59`
);
const ev = many<{ session_id: string; kind: string; client_ms: number; detail: string | null }>(
  `WITH fam AS (${FAM})
   SELECT e.session_id, e.kind, e.client_ms, e.detail FROM events e JOIN fam ON fam.id = e.family_id
   WHERE e.session_id NOT LIKE 'sim-%' ORDER BY e.created_at`,
  `${since} 00:00:00`,
  `${to} 23:59:59`
);

// ---- タスク到達（人単位） ----
const perFamily = new Map<string, number>();
for (const p of people) perFamily.set(p.family_id, (perFamily.get(p.family_id) ?? 0) + 1);
const familiesWithTwo = [...perFamily.values()].filter((n) => n >= 2).length;
const waterers = new Set(waterRows.map((w) => w.user_id));
const decorators = new Set(artifacts.map((a) => a.user_id));
const senders = new Set(nudges.filter((n) => n.kind === 'heart').map((n) => n.from_user));
const photographers = new Set(artifacts.filter((a) => a.type === 'photo').map((a) => a.user_id));

// ---- 初見の速さ（イベントから） ----
const bySession = new Map<string, { press?: number; modals: number; ended: boolean }>();
for (const e of ev) {
  const s = bySession.get(e.session_id) ?? { modals: 0, ended: false };
  if (e.kind === 'water_press' && s.press === undefined) s.press = e.client_ms;
  if (e.kind === 'modal_open') s.modals++;
  if (e.kind === 'session_end') s.ended = true;
  bySession.set(e.session_id, s);
}
const sessions = [...bySession.values()];
const presses = sessions.map((s) => s.press).filter((x): x is number => typeof x === 'number');

// ---- 復帰（枯れ→復帰とみなせる間隔） ----
let returns = 0;
for (let i = 1; i < waterRows.length; i++) {
  if (waterRows[i].user_id !== waterRows[i - 1].user_id) continue;
  const d = (Date.parse(waterRows[i].watered_date) - Date.parse(waterRows[i - 1].watered_date)) / day;
  if (d >= 4) returns++;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const sec = (ms: number | null) => (ms === null ? '—' : (ms / 1000).toFixed(1));

const out = {
  window: { since, to },
  families: families.length,
  people: people.length,
  peoplePerFamily: families.length ? Math.round((people.length / families.length) * 10) / 10 : 0,
  // タスク到達（分母は参加した人。教えた操作なので「できるか」であって「やる気」ではない）
  reached: {
    invite: { n: familiesWithTwo, pct: pct(familiesWithTwo, families.length) },
    water: { n: waterers.size, pct: pct(waterers.size, people.length) },
    decorate: { n: decorators.size, pct: pct(decorators.size, people.length) },
    photo: { n: photographers.size, pct: pct(photographers.size, people.length) },
    send: { n: senders.size, pct: pct(senders.size, people.length) },
  },
  waterings: waterRows.length,
  artifacts: artifacts.length,
  photos: artifacts.filter((a) => a.type === 'photo').length,
  nudges: nudges.length,
  returns,
  streakMix: Object.entries(
    streaks.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.streak_days]: (acc[s.streak_days] ?? 0) + 1 }), {})
  )
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([d, n]) => `${d}日:${n}世帯`)
    .join(', '),
  sessions: sessions.length,
  pressMedianSec: presses.length ? Math.round((median(presses) as number) / 100) / 10 : null,
  pressMinSec: presses.length ? Math.round(Math.min(...presses) / 100) / 10 : null,
  pressMaxSec: presses.length ? Math.round(Math.max(...presses) / 100) / 10 : null,
  pressOver10s: presses.filter((p) => p > 10_000).length,
  modalMedian: median(sessions.map((s) => s.modals)),
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

if (!families.length) {
  console.log(`\n${since} 以降に参加した家族が無い。\n`);
  console.log('仲間には本番 https://famitree.pages.dev で自分の家族を作ってもらう（偽の家族は作らない）。');
  console.log('参加したのにここが0なら、日付を指定する: bun run verify:material --since=2026-11-05\n');
  process.exit(0);
}

const p = people.length;
const r = out.reached;
const sum = `n=${families.length}世帯${p}人（${since}〜${to}）`;

console.log(`\n## 発表に貼る数字\n`);
console.log(sum + '\n');
console.log(`| 到達 | 人 | 割合 |`);
console.log(`|---|---|---|`);
console.log(`| 家族を作った | ${p} | — |`);
console.log(`| 2人以上になった家族 | ${r.invite.n} | ${r.invite.pct}%（世帯比） |`);
console.log(`| 水をやった | ${r.water.n} | ${r.water.pct}% |`);
console.log(`| 何か飾った | ${r.decorate.n} | ${r.decorate.pct}% |`);
console.log(`| 写真を飾った | ${r.photo.n} | ${r.photo.pct}% |`);
console.log(`| 誰かに送った | ${r.send.n} | ${r.send.pct}% |`);
console.log('');
console.log(`| 量 | 値 |`);
console.log(`|---|---|`);
console.log(`| 世帯あたり人数 | ${out.peoplePerFamily}人 |`);
console.log(`| 水やり | ${out.waterings}件 |`);
console.log(`| 飾り | ${out.artifacts}件（うち写真${out.photos}） |`);
console.log(`| エール | ${out.nudges}件 |`);
console.log(`| 枯れ→復帰 | ${out.returns}回 |`);
console.log(`| 連続日数 | ${out.streakMix || '—'} |`);
console.log('');
console.log(`## 初見の速さ（操作ログ）\n`);
console.log(`| 指標 | 値 |`);
console.log(`|---|---|`);
console.log(`| 記録したセッション | ${out.sessions} |`);
console.log(`| 水やりを押すまで（中央値） | ${sec(out.pressMedianSec === null ? null : out.pressMedianSec * 1000)}秒 |`);
console.log(`| 最短 / 最長 | ${sec(out.pressMinSec === null ? null : out.pressMinSec * 1000)}秒 / ${sec(out.pressMaxSec === null ? null : out.pressMaxSec * 1000)}秒 |`);
console.log(`| 10秒を超えた人 | ${out.pressOver10s}人 |`);
console.log(`| 開いた画面の数（中央値） | ${out.modalMedian === null ? '—' : out.modalMedian} |`);
console.log('');
console.log(`## そのまま使える文\n`);
console.log(`> ${sum}で、家族を作った人のうち${r.water.n}人が水をやった。`);console.log(`> 最初の水やりまで中央値${sec(out.pressMedianSec === null ? null : out.pressMedianSec * 1000)}秒、10秒を超えたのは${out.pressOver10s}人。`);
console.log(`> 何かを飾ったのは${r.decorate.n}人、うち写真は${r.photo.n}人。誰かに送ったのは${r.send.n}人。`);
console.log('');
if (p < 10) {
  console.log(`※ n=${p}。割合は1人で${(100 / p).toFixed(1)}%動く。発表では実数（「${r.water.n}人が水をやった」）で書き、割合は補助にする。`);
  console.log(`※ これは「教えた操作ができるか」のテスト。継続・習慣化は測っていない。\n`);
}
