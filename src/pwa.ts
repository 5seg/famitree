import { registerSW } from 'virtual:pwa-register';

// 端末側でキャッシュを消す操作ができない前提の、古い画面を自分で畳む仕組み。
// 1. 起動・復帰・一定間隔で、配信中の index.html といま動いているバンドルを突き合わせる
// 2. 違えばリロード。リロードしても古いままなら SW とキャッシュを捨てて取り直す
// 3. SW が入れ替わった時点でもリロードする（開いたままの画面のため）
const RELOAD_AT_KEY = 'famitree-reload-at';
const ATTEMPT_KEY = 'famitree-stale-attempts';
const RELOAD_GUARD_MS = 15_000;
const CHECK_INTERVAL_MS = 60_000;
const MAX_ATTEMPTS = 4;

const entryBundle = () => {
  const script = [...document.querySelectorAll<HTMLScriptElement>('script[src]')].find((s) =>
    /\/assets\/index-[^/]+\.js$/.test(s.src)
  );
  return script ? new URL(script.src).pathname : null;
};

const deployedBundle = async () => {
  const res = await fetch(`/?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
  const html = await res.text();
  return /\/assets\/index-[A-Za-z0-9_-]+\.js/.exec(html)?.[0] ?? null;
};

let reloading = false;

const dropServiceWorker = async () => {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    // 消せなくてもリロードでネットワークから取り直せるので握りつぶす
  }
};

const reloadOnce = async (reason: string) => {
  if (reloading) return;
  const last = Number(sessionStorage.getItem(RELOAD_AT_KEY) ?? 0);
  if (Date.now() - last < RELOAD_GUARD_MS) return;
  const attempts = Number(sessionStorage.getItem(ATTEMPT_KEY) ?? 0) + 1;
  // 何度捨てても古いままなら、配信側の問題として諦める（無限リロードにしない）
  if (attempts > MAX_ATTEMPTS) return;
  reloading = true;
  sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
  sessionStorage.setItem(ATTEMPT_KEY, String(attempts));
  if (attempts > 2) await dropServiceWorker();
  console.warn(`[famitree] 新しいビルドに切り替えます: ${reason} (attempt ${attempts})`);
  location.reload();
};

const checkFreshness = async () => {
  if (!import.meta.env.PROD) return;
  const running = entryBundle();
  if (!running) return;
  const deployed = await deployedBundle().catch(() => null);
  if (!deployed) return;
  if (deployed === running) {
    sessionStorage.removeItem(ATTEMPT_KEY);
    return;
  }
  await reloadOnce(`running ${running}, serving ${deployed}`);
};

if ('serviceWorker' in navigator) {
  // 初回訪問では controller がまだ居ない。その時の controllerchange まで拾うと
  // 初回インストールで画面が1回跳ねるので、前から SW に制御されていた時だけリロードする
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) void reloadOnce('service worker updated');
  });

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      const refresh = () => {
        void registration?.update().catch(() => {});
        void checkFreshness();
      };
      window.setTimeout(refresh, 2_000);
      window.setInterval(refresh, CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refresh();
      });
      window.addEventListener('online', refresh);
      window.addEventListener('pageshow', () => void checkFreshness());
    },
  });
}
