import { getPushKey, subscribePush } from './api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ブラウザが Web Push を使えるか（iOS はホーム画面に追加した PWA のみ true になる）
export const isPushSupported = (): boolean =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// 通知許可を求め、購読をサーバーへ登録する。成功で true
export const enablePush = async (): Promise<boolean> => {
  try {
    if (!isPushSupported()) return false;
    const { publicKey } = await getPushKey();
    if (!publicKey) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    // ready は SW 未登録（vite dev）だと永久に解決しないので getRegistration を使う
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });

    await subscribePush(sub.toJSON());
    return true;
  } catch (e) {
    console.error('enablePush error:', e);
    return false;
  }
};

// すでに購読済みか
export const isPushEnabled = async (): Promise<boolean> => {
  try {
    if (!isPushSupported() || Notification.permission !== 'granted') return false;
    
    const registration = await navigator.serviceWorker.getRegistration();
    const sub = await registration?.pushManager.getSubscription();
    if (!sub) return false;

    subscribePush(sub.toJSON()).catch(e => console.error('push sync err', e));
    return true;
  } catch (e) {
    return false;
  }
};
