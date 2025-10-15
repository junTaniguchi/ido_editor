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

import React, { useEffect, useState, useMemo, useRef, forwardRef, useCallback } from 'react';
import GithubSlugger from 'github-slugger';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useEditorStore } from '@/store/editorStore';
import { generateToc, TocItem } from '@/lib/tocUtils';
import { IoList, IoChevronDown, IoChevronForward } from 'react-icons/io5';
import MermaidPreview from './MermaidPreview';
import { arrayToMarkdownTable } from '@/lib/dataFormatUtils';

export interface MarkdownPreviewProps {
  tabId: string;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

const isAbsoluteUrl = (src: string) => /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(src);

const resolveImagePathSegments = (tabPath: string, rawSrc: string): string[] | null => {
  if (!rawSrc) return null;

  const cleanedSrc = rawSrc.trim();
  if (!cleanedSrc) return null;

  const [pathPart] = cleanedSrc.split(/[?#]/);
  const normalizedSrc = pathPart.replace(/\\/g, '/');
  const baseSegments = tabPath.split('/').filter(Boolean);
  if (baseSegments.length > 0) {
    baseSegments.pop();
  }

  const appendDecoded = (segments: string[], value: string) => {
    if (!value || value === '.') return;
    if (value === '..') {
      segments.pop();
      return;
    }
    try {
      segments.push(decodeURIComponent(value));
    } catch {
      segments.push(value);
    }
  };

  if (normalizedSrc.startsWith('/')) {
    const segments = normalizedSrc.split('/').filter(Boolean);
    const decoded: string[] = [];
    segments.forEach(segment => appendDecoded(decoded, segment));
    return decoded.length > 0 ? decoded : null;
  }

  const targetSegments = [...baseSegments];
  const parts = normalizedSrc.split('/');

  for (const part of parts) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      if (targetSegments.length > 0) {
        targetSegments.pop();
      }
      continue;
    }
    appendDecoded(targetSegments, part);
  }

  return targetSegments.length > 0 ? targetSegments : null;
};

interface MarkdownPreviewImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  tabPath: string;
  rootDirHandle: FileSystemDirectoryHandle | null;
}

const MarkdownPreviewImage: React.FC<MarkdownPreviewImageProps> = ({
  tabPath,
  rootDirHandle,
  src,
  alt,
  title,
  className,
  ...rest
}) => {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const normalizedTabPath = useMemo(() => tabPath.replace(/\\/g, '/'), [tabPath]);

  useEffect(() => {
    let isActive = true;

    const revokeObjectUrl = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    const loadImage = async () => {
      if (!isActive) return;

      revokeObjectUrl();
      setLoading(true);
      setError(null);
      setResolvedSrc(null);

      if (!src) {
        setLoading(false);
        setError('画像のパスが不正です。');
        return;
      }

      if (isAbsoluteUrl(src)) {
        if (!isActive) return;
        setResolvedSrc(src);
        setLoading(false);
        return;
      }

      if (!rootDirHandle) {
        setLoading(false);
        setError('画像を表示するにはフォルダを開いてください。');
        return;
      }

      if (!normalizedTabPath || normalizedTabPath.startsWith('temp_') || normalizedTabPath.startsWith('clipboard_')) {
        setLoading(false);
        setError('画像を表示するにはファイルを保存してください。');
        return;
      }

      const pathSegments = resolveImagePathSegments(normalizedTabPath, src);
      if (!pathSegments) {
        setLoading(false);
        setError('画像の場所を特定できませんでした。');
        return;
      }

      try {
        let directoryHandle: FileSystemDirectoryHandle = rootDirHandle;
        for (let index = 0; index < pathSegments.length - 1; index += 1) {
          directoryHandle = await directoryHandle.getDirectoryHandle(pathSegments[index]);
        }
        const fileHandle = await directoryHandle.getFileHandle(pathSegments[pathSegments.length - 1]);
        const file = await fileHandle.getFile();
        const objectUrl = URL.createObjectURL(file);

        if (!isActive) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        objectUrlRef.current = objectUrl;
        setResolvedSrc(objectUrl);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load markdown preview image:', err);
        revokeObjectUrl();

        if (!isActive) return;

        if (err instanceof DOMException && err.name === 'NotFoundError') {
          setError('画像ファイルが見つかりませんでした。');
        } else {
          setError('画像を読み込めませんでした。');
        }
        setLoading(false);
      }
    };

    loadImage();

    return () => {
      isActive = false;
      revokeObjectUrl();
    };
  }, [src, normalizedTabPath, rootDirHandle]);

  if (resolvedSrc) {
    return <img src={resolvedSrc} alt={alt ?? ''} title={title} className={className ?? 'max-w-full'} {...rest} />;
  }

  if (loading) {
    return <span className="text-xs text-gray-500 italic">画像を読み込み中...</span>;
  }

  if (error) {
    return <span className="text-xs text-red-500 italic">{error}</span>;
  }

  return null;
};

type TableCopyFormat = 'csv' | 'tsv' | 'markdown';

const TABLE_COPY_FORMATS: { value: TableCopyFormat; label: string }[] = [
  { value: 'csv', label: 'CSV形式でコピー' },
  { value: 'tsv', label: 'TSV形式でコピー' },
  { value: 'markdown', label: 'Markdown表でコピー' }
];

const formatLabelMap: Record<TableCopyFormat, string> = {
  csv: 'CSV形式',
  tsv: 'TSV形式',
  markdown: 'Markdown表形式'
};

const sanitizeCellValue = (value: string): string => value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

const tableRowsToArray = (table: HTMLTableElement): string[][] => {
  const rows: string[][] = [];
  Array.from(table.rows).forEach((row) => {
    const cells = Array.from(row.cells);
    if (cells.length === 0) return;
    rows.push(cells.map((cell) => sanitizeCellValue(cell.textContent ?? '')));
  });
  return rows;
};

const rowsToDelimitedText = (rows: string[][], delimiter: string): string => {
  const escapeCell = (value: string): string => {
    const needsQuote = value.includes(delimiter) || value.includes('"') || /[\r\n]/.test(value);
    const escaped = value.replace(/"/g, '""');
    return needsQuote ? `"${escaped}"` : escaped;
  };

  return rows.map((row) => row.map((cell) => escapeCell(cell)).join(delimiter)).join('\n');
};

interface MarkdownTableContainerProps {
  children: React.ReactElement;
}

const MarkdownTableContainer: React.FC<MarkdownTableContainerProps> = ({ children }) => {
  const tableRef = useRef<HTMLTableElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<TableCopyFormat | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuContainerRef.current) return;
      if (menuContainerRef.current.contains(event.target as Node)) return;
      closeMenu();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen, closeMenu]);

  const handleCopy = useCallback(
    async (format: TableCopyFormat) => {
      const table = tableRef.current;
      if (!table) {
        setCopyError('テーブルが見つかりませんでした。');
        setCopiedFormat(null);
        closeMenu();
        return;
      }

      const rows = tableRowsToArray(table);
      if (rows.length === 0) {
        setCopyError('コピーできるデータがありません。');
        setCopiedFormat(null);
        closeMenu();
        return;
      }

      let text = '';
      switch (format) {
        case 'csv':
          text = rowsToDelimitedText(rows, ',');
          break;
        case 'tsv':
          text = rowsToDelimitedText(rows, '\t');
          break;
        case 'markdown':
          text = arrayToMarkdownTable(rows);
          break;
        default:
          text = '';
      }

      if (!text) {
        setCopyError('コピーできるデータがありません。');
        setCopiedFormat(null);
        closeMenu();
        return;
      }

      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        setCopyError('クリップボード機能が利用できません。');
        setCopiedFormat(null);
        closeMenu();
        return;
      }

      try {
        await navigator.clipboard.writeText(text);
        setCopyError(null);
        setCopiedFormat(format);
        setTimeout(() => setCopiedFormat(null), 2000);
      } catch (err) {
        console.error('Failed to copy markdown table:', err);
        setCopyError('コピーに失敗しました。');
        setCopiedFormat(null);
      } finally {
        closeMenu();
      }
    },
    [closeMenu]
  );

  const clonedChild = React.isValidElement(children)
    ? React.cloneElement(children, {
        ref: (node: HTMLTableElement) => {
          tableRef.current = node;
          const { ref } = children as React.ReactElement & { ref?: React.Ref<HTMLTableElement> };
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref && typeof ref === 'object') {
            (ref as React.MutableRefObject<HTMLTableElement | null>).current = node;
          }
        },
        className: `w-full ${((children.props as { className?: string }).className ?? '').trim()}`.trim()
      })
    : children;

  const statusMessage = copyError
    ? { text: copyError, className: 'text-red-500' }
    : copiedFormat
      ? { text: `${formatLabelMap[copiedFormat]}をコピーしました`, className: 'text-green-600' }
      : null;

  return (
    <div className="my-4">
      <div className="relative group border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="overflow-x-auto rounded-lg">
          {clonedChild}
        </div>
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div ref={menuContainerRef} className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="px-3 py-1 text-xs font-medium bg-white/90 dark:bg-gray-800/90 border border-gray-300 dark:border-gray-600 rounded shadow-sm hover:bg-blue-600 hover:text-white transition"
            >
              表をコピー
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
                {TABLE_COPY_FORMATS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleCopy(option.value)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {statusMessage && (
        <p className={`mt-1 text-xs text-right ${statusMessage.className}`}>
          {statusMessage.text}
        </p>
      )}
    </div>
  );
};

const MarkdownPreview = forwardRef<HTMLDivElement, MarkdownPreviewProps>(({ tabId, onScroll }, ref) => {
  const { tabs, editorSettings, rootDirHandle } = useEditorStore();
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
  const currentTab = tabs.get(tabId);
  const imageBasePath = useMemo(() => {
    const identifier = currentTab?.id ? currentTab.id.replace(/\\/g, '/') : '';
    if (!identifier) return '';
    if (identifier.startsWith('temp_') || identifier.startsWith('clipboard_')) {
      return '';
    }
    return identifier;
  }, [currentTab?.id]);

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
                    return (
                      <div className="my-4">
                        <MermaidPreview content={trimmedCode} fileName={fileName} enableAiActions={false} />
                      </div>
                    );
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
                  <MarkdownTableContainer>
                    <table {...props}>{children}</table>
                  </MarkdownTableContainer>
                ),
                img: ({ node, ...props }) => (
                  <MarkdownPreviewImage
                    {...props}
                    tabPath={imageBasePath}
                    rootDirHandle={rootDirHandle}
                  />
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
