
import GithubSlugger from 'github-slugger';
/**
 * マークダウン文書から目次(Table of Contents)を生成するユーティリティ
 */

export interface TocItem {
  id: string;
  text: string;
  level: number;
  children?: TocItem[];
}

/**
 * マークダウン文書から見出しを抽出し、目次構造を生成する
 * 
 * @param markdownContent マークダウンコンテンツ
 * @returns 階層構造化された目次アイテムの配列
 */
export const generateToc = (markdownContent: string): TocItem[] => {
  // 見出し行を検出する正規表現
  // # 見出し1, ## 見出し2, ... のパターンを検出
  const slugger = new GithubSlugger();
  const headingRegex = /^(#+)\s*(.+)$/;
  const toc: TocItem[] = [];
  const lines = markdownContent.split('\n');
  for (const line of lines) {
    const match = line.match(headingRegex);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = slugger.slug(text);
      toc.push({ text, id, level, children: [] });
    }
  }
  return createHierarchy(toc);
};

/**
 * 平坦な見出しリストを階層構造に変換する
 * 
 * @param headings 平坦な見出しリスト
 * @returns 階層構造化された目次アイテムの配列
 */
const createHierarchy = (headings: TocItem[]): TocItem[] => {
  if (headings.length === 0) return [];

  const result: TocItem[] = [];
  let currentLevel = 1;
  let currentParent: TocItem[] = result;
  const stack: { items: TocItem[], level: number }[] = [{ items: result, level: 1 }];

  for (const heading of headings) {
    // 現在の見出しレベルよりも大きい（より深い階層）の場合
    while (heading.level > currentLevel && stack.length > 0) {
      const lastParentItem = currentParent[currentParent.length - 1];
      
      if (!lastParentItem) {
        // この階層の最初の項目の場合、前の親がないのでブレーク
        break;
      }
      
      if (!lastParentItem.children) {
        lastParentItem.children = [];
      }
      
      stack.push({ items: lastParentItem.children, level: currentLevel + 1 });
      currentParent = lastParentItem.children;
      currentLevel++;
    }

    // 現在の見出しレベルよりも小さい（より浅い階層）の場合
    while (heading.level < currentLevel && stack.length > 1) {
      stack.pop();
      const parent = stack[stack.length - 1];
      currentParent = parent.items;
      currentLevel = parent.level;
    }

    // 現在の階層に項目を追加
    currentParent.push({
      id: heading.id,
      text: heading.text,
      level: heading.level
    });
  }

  return result;
};
