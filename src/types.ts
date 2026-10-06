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
  coords: { x: number; y: number; rotate: number }; // Percentage position on tree
}

export const isAllowedImageUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ['images.unsplash.com', 'famitree-api.5seg.top'].includes(u.hostname);
  } catch {
    return false;
  }
};
