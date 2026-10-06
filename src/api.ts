import type { FamilyMember, TreeArtifact, TreeState } from './types';

// 開発時は Vite proxy 経由なので空。本番は VITE_API_BASE=https://famitree-api.5seg.top
const BASE = import.meta.env.VITE_API_BASE ?? '';
const TOKEN_KEY = 'famitree-token';

export interface AppState {
  family: {
    name: string;
    inviteCode: string;
    level: number;
    exp: number; // 0-99
    treeState: TreeState;
    streak: number;
  };
  members: FamilyMember[];
  artifacts: TreeArtifact[];
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

async function saveToken(p: Promise<{ token: string }>) {
  localStorage.setItem(TOKEN_KEY, (await p).token);
}

export const createFamily = (familyName: string, profile: Profile) =>
  saveToken(request('POST', '/api/families', { familyName, ...profile }));

export const joinFamily = (inviteCode: string, profile: Profile) =>
  saveToken(request('POST', '/api/join', { inviteCode, ...profile }));

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
