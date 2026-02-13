export type ConsentState = {
  v: 2;
  ts: number;
  necessary: true;
  analytics: boolean;
  ads: boolean;
  source?: 'user' | 'cmp';
};
