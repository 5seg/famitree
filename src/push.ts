// Web Push 購読。実装は後続コミットで入る（このシグネチャは UI 側との契約）

// ブラウザが Web Push を使えるか（iOS はホーム画面に追加した PWA のみ true になる）
export const isPushSupported = (): boolean => false;

// 通知許可を求め、購読をサーバーへ登録する。成功で true
export const enablePush = async (): Promise<boolean> => false;

// すでに購読済みか
export const isPushEnabled = async (): Promise<boolean> => false;
