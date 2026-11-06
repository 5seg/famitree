import type { FamilyMember, TreeArtifact, TreeState } from './types';

// 開発時は Vite proxy 経由なので空。本番は VITE_API_BASE=https://famitree-api.5seg.top
const BASE = import.meta.env.VITE_API_BASE ?? '';
const TOKEN_KEY = 'famitree-token';

// track.ts が直接 fetch するため公開する
export const API_BASE = BASE;

export interface AppState {
  family: {
    name: string;
    inviteCode: string;
    level: number;
    exp: number; // 0-99
    treeState: TreeState;
    streak: number;
    hasRecoveryKey?: boolean;
  };
  // 自分の状態。復旧コードを発行済みかどうかを設定画面で出すために使う
  me?: { id: string; name: string; isAdmin: boolean; hasRecovery: boolean };
  members: FamilyMember[];
  artifacts: TreeArtifact[];
  album: TreeArtifact[];
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data as T;
}

interface Profile {
  name: string;
  role: string;
  avatar: string;
}

// 復旧コードは平文を返せるのは発行した瞬間だけなので、受け取ったら画面で出しきる
interface Issued {
  token: string;
  recoveryCode: string;
}

const storeToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);

// 家族をつくる / 参加する。戻り値は端末を失くしたとき用の復旧コード
export async function createFamily(familyName: string, profile: Profile) {
  const r = await request<Issued>('POST', '/api/families', { familyName, ...profile });
  storeToken(r.token);
  return r.recoveryCode ?? '';
}

export async function joinFamily(inviteCode: string, profile: Profile) {
  const r = await request<Issued>('POST', '/api/join', { inviteCode, ...profile });
  storeToken(r.token);
  return r.recoveryCode ?? '';
}

// 端末を失くした端末から、自分の復旧コードで同じ参加者として戻る（古い端末のトークンは切れる）
export async function recoverSession(recoveryCode: string) {
  const r = await request<{ token: string; name: string }>('POST', '/api/recover', { recoveryCode });
  storeToken(r.token);
  return r.name;
}

// 家族の緊急用キーで管理者として入り直す。キーは使い捨てで、新しいキーが返る
export async function recoverFamily(recoveryCode: string, profile: Profile) {
  const r = await request<Issued & { familyRecoveryCode: string }>('POST', '/api/family/recover', {
    recoveryCode,
    ...profile,
  });
  storeToken(r.token);
  return { recoveryCode: r.recoveryCode, familyKey: r.familyRecoveryCode };
}

// 自分の復旧コードを発行・再発行（古いコードは無効になる）
export const issueRecoveryCode = () => request<{ recoveryCode: string }>('POST', '/api/recovery/issue');

// 家族の緊急用キーを発行・再発行（管理者のみ）
export const issueFamilyKey = () => request<{ recoveryCode: string }>('POST', '/api/family/recovery/issue');

export const fetchState = () => request<AppState>('GET', '/api/state');

export const waterTree = () => request<AppState>('POST', '/api/water');

export const addWood = (content: string) => request<AppState>('POST', '/api/artifacts', { type: 'wood', content });

// file はクライアント側で JPEG に縮小済みであること（サーバーは JPEG 以外を 415 で拒否）
export function addPhoto(file: Blob, title: string) {
  const form = new FormData();
  form.set('file', file, 'photo.jpg');
  form.set('title', title);
  return request<AppState>('POST', '/api/artifacts', form);
}

export const getPushKey = () => request<{ publicKey: string | null }>('GET', '/api/push/key');

export const subscribePush = (sub: PushSubscriptionJSON) => request<void>('POST', '/api/push/subscribe', sub);

// nudge: 未水やりの家族への催促（message 必須, 40文字まで） / heart: 見守りエール
export const sendNudge = (to: string[], kind: 'nudge' | 'heart', message?: string) =>
  request<{ sent: number }>('POST', '/api/nudge', { to, kind, message });

// 家族管理（管理者のみ）
export const removeMember = (id: string) => request<AppState>('POST', '/api/members/remove', { id });

export const setMemberAdmin = (id: string, admin: boolean) =>
  request<AppState>('POST', '/api/members/admin', { id, admin });

// 本人が家族から抜ける
export const leaveFamily = () => request<void>('POST', '/api/members/leave');
