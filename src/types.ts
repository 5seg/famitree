export type TreeState = 'thriving' | 'growing' | 'wilting' | 'hibernating';

export interface FamilyMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
  avatarColor: string;
  wateredToday: boolean;
  streak: number;
  lastMessage?: string;
  isCurrentUser?: boolean;
  isAdmin?: boolean;
}

export interface TreeArtifact {
  id: string;
  type: 'photo' | 'wood';
  author: string;
  authorAvatar: string;
  authorRole: string;
  date: string;
  title: string;
  content: string; // Image URL or Text message
  // アップロード時に保存された位置。描画は枚数から自動配置するので、傾きと揺らぎの種としてだけ使う
  coords: { x: number; y: number; rotate: number };
}
