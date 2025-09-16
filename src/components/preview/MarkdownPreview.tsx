/**
 * MarkdownPreview.tsx
 * Markdownテキストのプレビュー表示Reactコンポーネント。
 * 主な機能:
 * - Markdownのレンダリング（HTML化）
 * - コードブロック・リスト・テーブル等の表示
 * - シンタックスハイライト対応
 * - ダークモード対応
 */
'use client';
'use client';

import React, { useEffect, useState, useMemo, useRef, forwardRef } from 'react';
import GithubSlugger from 'github-slugger';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useEditorStore } from '@/store/editorStore';
import { generateToc, TocItem } from '@/lib/tocUtils';
import { IoList, IoChevronDown, IoChevronForward } from 'react-icons/io5';
import MermaidPreview from './MermaidPreview';

export interface MarkdownPreviewProps {
  tabId: string;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

const MarkdownPreview = forwardRef<HTMLDivElement, MarkdownPreviewProps>(({ tabId, onScroll }, ref) => {
  const { tabs, editorSettings } = useEditorStore();
  const fontSize = editorSettings.fontSize || 16;
  const [markdown, setMarkdown] = useState('');
  const [showToc, setShowToc] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const headingCounterRef = useRef<Record<string, number>>({});
  
  // 見出しIDのマッピングを保持するために使用（目次とマークダウン本文で同じIDを使用するため）
  const headingIdsRef = useRef<Record<string, string>>({});
  
  // マークダウンから目次を生成
  const tocItems = useMemo(() => {
    // 新しいマークダウンコンテンツが来たら見出しカウンターとIDマッピングをリセット
    headingCounterRef.current = {};
    headingIdsRef.current = {};
    const items = generateToc(markdown);
    
    // 生成された目次項目からIDマッピングを作成
    const collectIds = (items: TocItem[]) => {
      items.forEach(item => {
        headingIdsRef.current[item.text] = item.id;
        if (item.children) {
          collectIds(item.children);
        }
      });
    };
    collectIds(items);
    
    return items;
  }, [markdown]);
  
  // 目次項目がクリックされたときの処理
  const handleTocItemClick = (text: string) => {
    const id = headingIdsRef.current[text] || text;
    const element = document.getElementById(id);
    if (element && ref && (ref as React.RefObject<HTMLDivElement>).current) {
      const parent = (ref as React.RefObject<HTMLDivElement>).current;
      const rect = element.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const scrollDelta = rect.top - parentRect.top;
      parent.scrollTop += scrollDelta;
    } else if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    } else {
    }
  };
  
  // 目次項目の展開状態を切り替える
  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpandedItems = new Set(expandedItems);
    if (newExpandedItems.has(id)) {
      newExpandedItems.delete(id);
    } else {
      newExpandedItems.add(id);
    }
    setExpandedItems(newExpandedItems);
  };
  
  useEffect(() => {
    const tab = tabs.get(tabId);
    if (tab) {
      setMarkdown(tab.content);
    }
  }, [tabId, tabs]);
  
  // 初期状態ですべての目次項目を展開
  useEffect(() => {
    const newExpandedItems = new Set<string>();
    const expandAll = (items: TocItem[]) => {
      items.forEach(item => {
        newExpandedItems.add(item.id);
        if (item.children) {
          expandAll(item.children);
        }
      });
    };
    
    expandAll(tocItems);
    setExpandedItems(newExpandedItems);
  }, [tocItems]);
  
  // 内容が変わった時に更新するためのリスナー
  useEffect(() => {
    const handleTabUpdate = () => {
      const tab = tabs.get(tabId);
      if (tab) {
        setMarkdown(tab.content);
      }
    };
    
    // 更新イベントを監視（実際のZustandイベント監視方法に置き換えが必要かもしれません）
    const checkInterval = setInterval(handleTabUpdate, 1000);
    
    return () => {
      clearInterval(checkInterval);
    };
  }, [tabId, tabs]);
  
  // 目次を再帰的にレンダリング
  const renderTocItem = (item: TocItem, depth = 0) => {
    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
    const isExpanded = expandedItems.has(item.id);
    return (
      <div key={item.id} className="toc-item">
        <div 
          className={`flex items-center py-1 px-2 hover:bg-gray-200 cursor-pointer rounded ${depth > 0 ? 'ml-' + (depth * 2) : ''}`}
          onClick={() => handleTocItemClick(item.text)}
          style={{ marginLeft: `${depth * 12}px` }}
        >
          {item.text}
        </div>
        {hasChildren && isExpanded && item.children && (
          <div className="ml-4">
            {item.children.map((child: TocItem) => renderTocItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // JSX全体をreturn
  return (
    <div className="h-full flex">
      {/* 目次サイドバー */}
      {tocItems.length > 0 && showToc && (
        <div className="w-64 h-full overflow-auto bg-gray-100 border-r border-gray-300">
          <div className="p-3 border-b border-gray-300 flex justify-between items-center">
            <h3 className="font-medium text-sm flex items-center">
              <IoList className="mr-1" />
              目次
            </h3>
            <div className="flex items-center gap-2">
              <button 
                className="px-2 py-1 rounded flex items-center text-xs text-white"
                style={{ backgroundColor: '#2B579A' }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = '#1B3A6B')}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = '#2B579A')}
                onClick={() => {
                  import('docx').then(({ Document, Packer, Paragraph }) => {
                    const doc = new Document({
                      sections: [
                        { children: [new Paragraph(markdown)] }
                      ]
                    });
                    Packer.toBlob(doc).then(blob => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = (tabs.get(tabId)?.name?.replace(/\.md$/, '') || 'markdown') + '.docx';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    });
                  });
                }}
                title="Word形式でエクスポート"
              >
                <svg className="inline mr-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Word出力
              </button>
              <button 
                className="text-xs text-blue-600 hover:underline"
                onClick={() => setShowToc(false)}
              >
                閉じる
              </button>
            </div>
          </div>
          <div className="p-2">
            {tocItems.map((item: TocItem) => renderTocItem(item))}
          </div>
        </div>
      )}
      {/* メインコンテンツ */}
      <div
        className={`${showToc && tocItems.length > 0 ? 'flex-1 min-h-0' : 'w-full'} h-full min-h-0 overflow-auto bg-white text-gray-900 dark:bg-[#0f172a] dark:text-gray-100 relative`}
        ref={ref}
        onScroll={onScroll}
      >
        {/* 目次トグルボタン（目次が閉じている場合のみ表示） */}
        {!showToc && tocItems.length > 0 && (
          <button
            className="absolute top-2 left-2 z-10 p-1.5 rounded-full bg-gray-200 hover:bg-gray-300"
            onClick={() => setShowToc(true)}
            title="目次を表示"
          >
            <IoList size={18} />
          </button>
        )}
        <div className="px-6 py-8">
          <article
            className={`markdown-body max-w-none`}
            style={{
              backgroundColor: 'inherit',
              color: 'inherit',
              fontSize: `${fontSize}px`,
              lineHeight: 1.7,
            }}
          >
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                a: ({ node, href, children, ...props }) => {
                  const isInternalLink = href?.startsWith('#');
                  if (isInternalLink) {
                    return <a href={href} {...props}>{children}</a>;
                  }
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
                  );
                },
                code: ({ className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const isInline = !match;
                  // childrenが配列やノードの場合も厳密に文字列化
                  const extractText = (node: any): string => {
                    if (typeof node === 'string') {
                      if (node.trim() === '') return '';
                      return node;
                    }
                    if (Array.isArray(node)) {
                      return node.map(extractText).filter(Boolean).join('');
                    }
                    if (node && node.props) {
                      if (node.props.children) {
                        return extractText(node.props.children);
                      }
                      return '';
                    }
                    return '';
                  };
                  let codeString = extractText(children);
                  codeString = codeString.replace(/\r?\n[ \t]*/g, '\n');
                  const trimmedCode = codeString.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
                  // Mermaid描画対応
                  if (match?.[1] === 'mermaid') {
                    const fileName = tabs.get(tabId)?.name || 'mermaid-diagram.mmd';
                    // MermaidPreviewを描画
                    return <div className="my-4"><MermaidPreview content={trimmedCode} fileName={fileName} /></div>;
                  }
                  // 通常配色（枠線なし）
                  const preClass = 'rounded px-5 py-3 my-4 bg-gray-100 text-gray-900 whitespace-pre-line';
                  const codeClass = 'bg-gray-100 text-gray-900 whitespace-pre-line';
                  const [copied, setCopied] = React.useState(false);
                  const handleCopy = () => {
                    navigator.clipboard.writeText(trimmedCode).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1200);
                    });
                  };
                  return !isInline ? (
                    <div className="relative group">
                      <button
                        className="absolute top-2 right-2 z-10 px-2 py-1 text-xs bg-gray-200 hover:bg-blue-600 hover:text-white rounded transition"
                        style={{ fontSize: '12px' }}
                        onClick={handleCopy}
                        title="コードをコピー"
                      >
                        {copied ? 'コピーしました' : 'コピー'}
                      </button>
                      <pre className={`language-${match?.[1]} ${preClass}`}> <code className={`language-${match?.[1]} ${codeClass}`} {...props}>{trimmedCode}</code> </pre>
                    </div>
                  ) : (
                    <code className={`${className} ${codeClass}`} {...props}>{trimmedCode}</code>
                  );
                },
                table: ({ children, ...props }) => (
                  <div className="overflow-x-auto my-4">
                    <table {...props}>{children}</table>
                  </div>
                ),
                h1: ({ children, ...props }) => {
                  const text = Array.isArray(children) ? children.join('') : children?.toString() || '';
                  const slugger = new GithubSlugger();
                  const id = slugger.slug(text);
                  return <h1 id={id} {...props}>{children}</h1>;
                },
                h2: ({ children, ...props }) => {
                  const text = Array.isArray(children) ? children.join('') : children?.toString() || '';
                  const slugger = new GithubSlugger();
                  const id = slugger.slug(text);
                  return <h2 id={id} {...props}>{children}</h2>;
                },
                h3: ({ children, ...props }) => {
                  const text = Array.isArray(children) ? children.join('') : children?.toString() || '';
                  const slugger = new GithubSlugger();
                  const id = slugger.slug(text);
                  return <h3 id={id} {...props}>{children}</h3>;
                },
                h4: ({ children, ...props }) => {
                  const text = Array.isArray(children) ? children.join('') : children?.toString() || '';
                  const slugger = new GithubSlugger();
                  const id = slugger.slug(text);
                  return <h4 id={id} {...props}>{children}</h4>;
                },
                h5: ({ children, ...props }) => {
                  const text = Array.isArray(children) ? children.join('') : children?.toString() || '';
                  const slugger = new GithubSlugger();
                  const id = slugger.slug(text);
                  return <h5 id={id} {...props}>{children}</h5>;
                },
                h6: ({ children, ...props }) => {
                  const text = Array.isArray(children) ? children.join('') : children?.toString() || '';
                  const slugger = new GithubSlugger();
                  const id = slugger.slug(text);
                  return <h6 id={id} {...props}>{children}</h6>;
                },
              }}
            >
              {markdown}
            </ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  );
});
export default MarkdownPreview;
