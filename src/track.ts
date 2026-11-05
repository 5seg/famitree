// 操作ログ。検証で「何秒で押したか」「どこで迷ったか」を数字にするためだけに存在する。
// 写真や一言の中身、位置情報、氏名は一切送らない。種別・経過ミリ秒・（任意の）短い注記だけ。
import { API_BASE, getToken } from './api';

type Ev = { kind: string; detail?: string; t: number };

const SESSION_KEY = 'famitree-session';
const FLUSH_AFTER_MS = 2000;
const MAX_BUFFER = 50;

let sessionId = '';
let startedAt = 0;
let buffer: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

const flush = (keepalive = false) => {
  clearTimeout(timer);
  if (!buffer.length || !sessionId) return;
  const events = buffer;
  buffer = [];
  const token = getToken();
  if (!token) return;
  void fetch(`${API_BASE}/api/events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, events }),
    keepalive,
  }).catch(() => {
    // 記録は本質ではないので失敗は握りつぶす
  });
};

/** タブごとのセッションを開始する。多重呼び出しは無視される。 */
export const startSession = () => {
  if (sessionId) return;
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    sessionId = id;
    startedAt = performance.now();
  } catch {
    sessionId = crypto.randomUUID();
    startedAt = performance.now();
  }
};

/** 画面表示からの経過ミリ秒でイベントを積む。 */
export const track = (kind: string, detail?: string) => {
  if (!sessionId) return;
  buffer.push({ kind, detail, t: Math.round(performance.now() - startedAt) });
  if (buffer.length >= MAX_BUFFER) {
    flush();
    return;
  }
  clearTimeout(timer);
  timer = setTimeout(() => flush(), FLUSH_AFTER_MS);
};

/** タブが閉じる・隠れるときに呼ぶ。残りを落とさず送る。 */
export const endSession = (detail?: string) => {
  track('session_end', detail);
  flush(true);
};
