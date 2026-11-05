// 実際の利用データを集計する（読み取り専用）。
//
//   bun run verify:report
//   bun run verify:report --json
//
// 本番 DB に対して実行する。書き込みはしない。検証用（verify-）と生成データ（sim-）は除く。
// 出すのは集計値だけ。家族名・個人名は出さない。
import { Database } from 'bun:sqlite';
import { join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dir, '..', 'data');
const db = new Database(join(DATA_DIR, 'famitree.db'), { readonly: true });

const one = <T>(sql: string, ...params: unknown[]): T => db.query(sql).get(...(params as never[])) as T;
const many = <T>(sql: string, ...params: unknown[]): T[] => db.query(sql).all(...(params as never[])) as T[];

// 検証用の家族を除いた本物の利用者
const REAL = "id NOT LIKE 'verify-%'";
const day = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
const now = Date.now();
const since = (days: number) => iso(new Date(now - days * day));

const families = one<{ n: number }>(`SELECT count(*) n FROM families WHERE ${REAL}`).n;
const members = one<{ n: number }>(
  `SELECT count(*) n FROM users u JOIN families f ON f.id = u.family_id WHERE f.${REAL} AND u.removed_at IS NULL`
).n;
const waterings = one<{ n: number }>(`SELECT count(*) n FROM watering_logs w JOIN families f ON f.id = w.family_id WHERE f.${REAL}`).n;
const waterings7 = one<{ n: number }>(`SELECT count(*) n FROM watering_logs w JOIN families f ON f.id = w.family_id WHERE f.${REAL} AND w.created_at >= ?`, since(7)).n;
const waterings28 = one<{ n: number }>(`SELECT count(*) n FROM watering_logs w JOIN families f ON f.id = w.family_id WHERE f.${REAL} AND w.created_at >= ?`, since(28)).n;
const active7 = one<{ n: number }>(
  `SELECT count(DISTINCT w.user_id) n FROM watering_logs w JOIN families f ON f.id = w.family_id WHERE f.${REAL} AND w.created_at >= ?`,
  since(7)
).n;
const artifacts = one<{ n: number }>(`SELECT count(*) n FROM artifacts a JOIN families f ON f.id = a.family_id WHERE f.${REAL}`).n;
const photos = one<{ n: number }>(`SELECT count(*) n FROM artifacts a JOIN families f ON f.id = a.family_id WHERE f.${REAL} AND a.type = 'photo'`).n;
const nudges = one<{ n: number }>(`SELECT count(*) n FROM nudges n2 JOIN users u ON u.id = n2.from_user JOIN families f ON f.id = u.family_id WHERE f.${REAL}`).n;
const streaks = many<{ streak_days: number; tree_status: string }>(`SELECT streak_days, tree_status FROM families WHERE ${REAL}`);
const first = one<{ d: string | null }>(`SELECT min(w.watered_date) d FROM watering_logs w JOIN families f ON f.id = w.family_id WHERE f.${REAL}`).d;
const last = one<{ d: string | null }>(`SELECT max(w.watered_date) d FROM watering_logs w JOIN families f ON f.id = w.family_id WHERE f.${REAL}`).d;
const events = one<{ n: number }>(`SELECT count(*) n FROM events WHERE session_id NOT LIKE 'sim-%'`).n;

// 復帰: 同じ人が4日以上あけて水をやった回数（枯れ→復帰とみなす）
const gaps = many<{ user_id: string; watered_date: string }>(
  `SELECT w.user_id, w.watered_date FROM watering_logs w JOIN families f ON f.id = w.family_id WHERE f.${REAL} ORDER BY w.user_id, w.watered_date`
);
let returns = 0;
let gapDaysTotal = 0;
for (let i = 1; i < gaps.length; i++) {
  if (gaps[i].user_id !== gaps[i - 1].user_id) continue;
  const d = (Date.parse(gaps[i].watered_date) - Date.parse(gaps[i - 1].watered_date)) / day;
  if (d >= 4) {
    returns++;
    gapDaysTotal += Math.round(d);
  }
}

const counts = new Map<number, number>();
for (const s of streaks) counts.set(s.streak_days, (counts.get(s.streak_days) ?? 0) + 1);
const treeMix = streaks.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.tree_status]: (acc[s.tree_status] ?? 0) + 1 }), {});

const out = {
  families,
  members,
  waterings,
  waterings7,
  waterings28,
  active7,
  weeklyRetention: members ? Math.round((active7 / members) * 1000) / 10 : 0,
  artifacts,
  photos,
  nudges,
  returns,
  avgReturnGapDays: returns ? Math.round((gapDaysTotal / returns) * 10) / 10 : 0,
  streakMix: [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([days, n]) => `${days}日:${n}世帯`).join(', '),
  treeMix,
  firstWateredDate: first,
  lastWateredDate: last,
  events,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

console.log(`\n## 実ユーザーのデータ（${first ?? '—'} 〜 ${last ?? '—'}）\n`);
console.log(`| 指標 | 値 |`);
console.log(`|---|---|`);
console.log(`| 世帯 | ${families} |`);
console.log(`| 人（退出を除く） | ${members} |`);
console.log(`| 水やりの総数 | ${waterings} |`);
console.log(`| 水やり（直近28日） | ${waterings28} |`);
console.log(`| 水やり（直近7日） | ${waterings7} |`);
console.log(`| 直近7日に水をやった人 | ${active7}人（週次継続 ${out.weeklyRetention}%） |`);
console.log(`| 写真 | ${photos} |`);
console.log(`| 一言・木片などの飾り | ${artifacts - photos} |`);
console.log(`| エール | ${nudges} |`);
console.log(`| 枯れ→復帰（4日以上あけて水やり） | ${returns}回（平均${out.avgReturnGapDays}日ぶり） |`);
console.log(`| 連続日数の分布 | ${out.streakMix || '—'} |`);
console.log(`| 木の状態 | ${JSON.stringify(treeMix)} |`);
console.log(`| 操作ログ（events） | ${events} |`);
console.log('');
if (families < 10) {
  console.log(`※ 世帯${families}・水やり${waterings}件。傾向を語るには足りない。数を言うだけなら足りる。\n`);
}
