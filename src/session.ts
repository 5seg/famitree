import { ref } from 'vue';
import { ApiError, clearToken, getToken } from './api';

// トークンの有無。401 を受けたら false に落として参加画面へ戻す
export const authed = ref(!!getToken());

const MESSAGES: [RegExp, string][] = [
  [/invite code not found/, '招待コードが見つかりません'],
  [/too large/, '写真が大きすぎます'],
  [/must be JPEG/, '写真の形式に対応していません'],
  [/too long/, '文字数が多すぎます'],
  [/required/, '入力内容を確認してください'],
];

// API/ネットワークエラーを表示用の日本語にする。401 はここでセッション破棄
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) {
      clearToken();
      authed.value = false;
      return 'もう一度参加してください';
    }
    return MESSAGES.find(([re]) => re.test(e.message))?.[1] ?? 'うまくいきませんでした。もう一度お試しください';
  }
  return '通信に失敗しました。電波の良いところで再度お試しください';
}
