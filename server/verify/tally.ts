// 検証の記録を集計する。発表に使う数字をそのまま出す。
//
//   bun run verify:tally          # 集計して表示
//   bun run verify:tally --json   # 生データを JSON で出す
//
// 記録しているのは種別と経過ミリ秒だけ。写真や一言の中身、氏名は入っていない。
import { Database } from 'bun:sqlite';
import { join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dir, '..', 'data');
const db = new Database(join(DATA_DIR, 'famitree.db'), { create: true, strict: true });

type Row = {
  family_id: string;
  family_name: string;
  member_name: string;
  session_id: string;
  kind: string;
  detail: string | null;
  client_ms: number;
  created_at: string;
};

const rows = db
  .query<Row, []>(`
    SELECT e.family_id, f.name AS family_name, u.name AS member_name, e.session_id,
           e.kind, e.detail, e.client_ms, e.created_at
    FROM events e JOIN families f ON f.id = e.family_id JOIN users u ON u.id = e.user_id
    WHERE e.family_id LIKE 'verify-%'
    ORDER BY e.created_at, e.rowid`)
  .all();

if (process.argv[2] === '--json') {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

if (!rows.length) {
  console.log('記録が無い。`bun run verify:seed` で家族を作り、被験者に触ってもらってから実行する');
  process.exit(0);
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sec = (ms: number) => (Number.isFinite(ms) ? (ms / 1000).toFixed(1) : '—');

type Session = {
  family: string;
  variant: 'A' | 'B' | '?';
  member: string;
  pressMs: number | null;
  watered: boolean;
  added: number;
  nudge: number;
  modals: string[];
  hidden: number;
};

const sessions = new Map<string, Session>();
for (const r of rows) {
  const s =
    sessions.get(r.session_id) ??
    ({
      family: r.family_name,
      variant: r.family_id.startsWith('verify-a-') ? 'A' : r.family_id.startsWith('verify-b-') ? 'B' : '?',
      member: r.member_name,
      pressMs: null,
      watered: false,
      added: 0,
      nudge: 0,
      modals: [],
      hidden: 0,
    } satisfies Session);
  if (r.kind === 'water_press' && s.pressMs === null) s.pressMs = r.client_ms;
  if (r.kind === 'water_ok') s.watered = true;
  if (r.kind === 'artifact_saved') s.added++;
  if (r.kind === 'nudge_sent' && r.detail === 'heart') s.nudge++;
  if (r.kind === 'modal_open' && r.detail) s.modals.push(r.detail);
  if (r.kind === 'session_end') s.hidden++;
  sessions.set(r.session_id, s);
}

const all = [...sessions.values()];
const a = all.filter((s) => s.variant === 'A');
const b = all.filter((s) => s.variant === 'B');
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%（${n}/${d}）` : '—');

console.log('\n## 家族ごと\n');
console.log('家族 | 種別 | 被験者 | 押すまで | 水やり | 追加 | エール | 開いた画面 | 中座');
console.log('--- | --- | --- | --- | --- | --- | --- | --- | ---');
for (const s of all) {
  const modals = [...new Set(s.modals)].join(',') || '—';
  console.log(
    `${s.family} | ${s.variant} | ${s.member} | ${sec(s.pressMs ?? NaN)}s | ${s.watered ? '○' : '×'} | ${s.added} | ${s.nudge} | ${modals} | ${s.hidden}`
  );
}

console.log('\n## まとめ\n');
console.log(`- 被験者: ${all.length} セッション（満開 ${a.length} / 止まった ${b.length}）`);
const stat = (label: string, f: (xs: (typeof all)[number][]) => string) =>
  console.log(`- ${label}: 満開 ${f(a)} / 止まった ${f(b)}`);

stat('開いてから押すまでの中央値', (xs) => `${sec(median(xs.map((s) => s.pressMs ?? NaN)))}秒`);
stat('水やり実行率', (xs) => pct(xs.filter((s) => s.watered).length, xs.length));
stat('写真か一言を飾った人', (xs) => pct(xs.filter((s) => s.added > 0).length, xs.length));
stat('家族にエールを送った人', (xs) => pct(xs.filter((s) => s.nudge > 0).length, xs.length));
stat('1セッションで開いた画面数の中央値', (xs) => String(median(xs.map((s) => s.modals.length))));
console.log(`- 全体の水やり実行率: ${pct(all.filter((s) => s.watered).length, all.length)}`);
console.log('');
