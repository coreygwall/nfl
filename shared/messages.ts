export const MESSAGE_MAX_LENGTH = 2000;

export interface PoolMessage {
  id: string;
  authorName: string;
  authorRole: 'commissioner';
  body: string;
  createdAt: string;
  updatedAt: string;
  likes: number;
  liked: boolean;
}

export interface MessagesResponse {
  enabled: boolean;
  postingPolicy: 'commissioners';
  canManage: boolean;
  canReact: boolean;
  messages: PoolMessage[];
  nextCursor: string | null;
}
