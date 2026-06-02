export interface Token {
  c: string;
  cm: boolean;
  vr: boolean;
  bk: boolean;
  hw: boolean;
  hp?: boolean;  // headword 内的括号附注（比主标题略轻）
  pb?: boolean;  // 强制换页
  nl?: boolean;
  pn?: string;
  ii: number;
  isEng?: boolean;
}

export interface PlacedCell extends Token {
  pg: number;
  cl: number;
  rw: number;
  sc?: 0 | 1;
  sr?: 0 | 1;
  rs?: number;
}

export interface ItemMeta {
  id: string;
  title: string;
  cat: string;
  color: string;
  tags: string[];
  desc: string;
  link: string;
}
