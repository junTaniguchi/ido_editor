import { FileTreeItem, SearchMatch, SearchResult } from '@/types';

/**
 * ファイルシステムAPIでディレクトリ内容を再帰的に読み込む
 */
export const readDirectoryContents = async (
  dirHandle: FileSystemDirectoryHandle,
  path = ''
): Promise<FileTreeItem> => {
  const children: FileTreeItem[] = [];
  
  for await (const [name, handle] of dirHandle.entries()) {
    const itemPath = path ? `${path}/${name}` : name;
    
    if (handle.kind === 'directory') {
      // ディレクトリの場合は再帰的に読み込む
      const subdirItem = await readDirectoryContents(handle as FileSystemDirectoryHandle, itemPath);
      children.push(subdirItem);
    } else {
      // ファイルの場合は情報を追加
      children.push({
        name,
        path: itemPath,
        isDirectory: false,
        fileHandle: handle as FileSystemFileHandle
      });
    }
  }
  
  // 名前でソート（ディレクトリが先、次にファイル）
  children.sort((a, b) => {
    // ディレクトリとファイルで分ける
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    
    // 同じ種類ならアルファベット順
    return a.name.localeCompare(b.name);
  });
  
  return {
    name: dirHandle.name,
    path,
    isDirectory: true,
    children,
    directoryHandle: dirHandle
  };
};

/**
 * ファイルパスからFileSystemFileHandleを見つける
 */
export const findFileHandleByPath = (
  tree: FileTreeItem | null,
  path: string
): FileSystemFileHandle | null => {
  if (!tree) return null;
  
  // 完全一致のパス検索
  if (tree.path === path && !tree.isDirectory && tree.fileHandle) {
    return tree.fileHandle;
  }
  
  // 子アイテムを検索
  if (tree.children) {
    for (const child of tree.children) {
      const result = findFileHandleByPath(child, path);
      if (result) return result;
    }
  }
  
  return null;
};

/**
 * ファイルの内容を文字列として読み込む
 */
export const readFileContent = async (fileHandle: FileSystemFileHandle): Promise<string> => {
  try {
    const file = await fileHandle.getFile();
    
    // ファイルの種類に応じた処理
    const fileName = fileHandle.name.toLowerCase();
    
    // バイナリファイルの場合
    if (fileName.endsWith('.parquet')) {
      // 本来はParquetファイルのバイナリ処理が必要だが、
      // ブラウザでの制限があるため、テキストとして読み込む
      return await file.text();
    }
    
    // テキストファイルの場合
    return await file.text();
  } catch (error) {
    console.error('Error reading file:', error);
    throw new Error('ファイルの読み込みに失敗しました');
  }
};

/**
 * ファイルにテキスト内容を書き込む
 */
export const writeFileContent = async (
  fileHandle: FileSystemFileHandle,
  content: string
): Promise<boolean> => {
  try {
    // 書き込み可能なストリームを取得
    const writable = await fileHandle.createWritable();
    
    // テキストを書き込む
    await writable.write(content);
    
    // ストリームを閉じて変更を確定
    await writable.close();
    
    return true;
  } catch (error) {
    console.error('Error writing to file:', error);
    return false;
  }
};

/**
 * 新しいファイルを作成する
 */
export const createNewFile = async (
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  content: string = ''
): Promise<FileSystemFileHandle | null> => {
  try {
    // ファイルを作成/上書き
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    
    // 内容を書き込む
    if (content) {
      await writeFileContent(fileHandle, content);
    }
    
    return fileHandle;
  } catch (error) {
    console.error('Error creating file:', error);
    return null;
  }
};

/**
 * 新しいディレクトリを作成する
 */
export const createNewDirectory = async (
  dirHandle: FileSystemDirectoryHandle,
  dirName: string
): Promise<FileSystemDirectoryHandle | null> => {
  try {
    // ディレクトリを作成
    return await dirHandle.getDirectoryHandle(dirName, { create: true });
  } catch (error) {
    console.error('Error creating directory:', error);
    return null;
  }
};

/**
 * ファイルを削除する
 */
export const deleteFile = async (
  dirHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<boolean> => {
  try {
    await dirHandle.removeEntry(fileName);
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

/**
 * ディレクトリを再帰的に削除する
 */
export const deleteDirectory = async (
  dirHandle: FileSystemDirectoryHandle,
  dirName: string
): Promise<boolean> => {
  try {
    await dirHandle.removeEntry(dirName, { recursive: true });
    return true;
  } catch (error) {
    console.error('Error deleting directory:', error);
    return false;
  }
};

/**
 * ファイルをリネームする (FileSystem Access APIでは直接リネームできないため、コピー＆削除)
 */
export const renameFile = async (
  parentDirHandle: FileSystemDirectoryHandle,
  oldName: string,
  newName: string
): Promise<FileSystemFileHandle | null> => {
  try {
    // 古いファイルを取得
    const oldFileHandle = await parentDirHandle.getFileHandle(oldName);
    const oldFile = await oldFileHandle.getFile();
    
    // 内容を取得
    const content = await oldFile.text();
    
    // 新しいファイルを作成
    const newFileHandle = await createNewFile(parentDirHandle, newName, content);
    
    if (newFileHandle) {
      // 古いファイルを削除
      await deleteFile(parentDirHandle, oldName);
      return newFileHandle;
    }
    
    return null;
  } catch (error) {
    console.error('Error renaming file:', error);
    return null;
  }
};

/**
 * ディレクトリをリネームする (コピー＆削除方式)
 */
export const renameDirectory = async (
  parentDirHandle: FileSystemDirectoryHandle,
  oldName: string,
  newName: string
): Promise<FileSystemDirectoryHandle | null> => {
  try {
    // 古いディレクトリを取得
    const oldDirHandle = await parentDirHandle.getDirectoryHandle(oldName);
    
    // 新しいディレクトリを作成
    const newDirHandle = await createNewDirectory(parentDirHandle, newName);
    
    if (!newDirHandle) return null;
    
    // 古いディレクトリの内容を再帰的にコピー
    await copyDirectoryContents(oldDirHandle, newDirHandle);
    
    // 古いディレクトリを削除
    await deleteDirectory(parentDirHandle, oldName);
    
    return newDirHandle;
  } catch (error) {
    console.error('Error renaming directory:', error);
    return null;
  }
};

/**
 * ディレクトリの内容を再帰的にコピーする
 * この関数は、renameDirectory関数の再帰的コピー処理を分離して改善したもの
 */
export const copyDirectoryContents = async (
  sourceDir: FileSystemDirectoryHandle,
  targetDir: FileSystemDirectoryHandle
): Promise<boolean> => {
  try {
    for await (const [name, handle] of sourceDir.entries()) {
      if (handle.kind === 'file') {
        // ファイルをコピー
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const content = await file.text();
        await createNewFile(targetDir, name, content);
      } else if (handle.kind === 'directory') {
        // サブディレクトリを作成
        const subDir = await targetDir.getDirectoryHandle(name, { create: true });
        // 再帰的にサブディレクトリの内容をコピー
        await copyDirectoryContents(handle as FileSystemDirectoryHandle, subDir);
      }
    }
    return true;
  } catch (error) {
    console.error('Error copying directory contents:', error);
    return false;
  }
};

/**
 * ファイル内のテキストを検索する
 */
export const searchInFile = async (
  fileHandle: FileSystemFileHandle,
  query: string,
  options: {
    caseSensitive: boolean;
    useRegex: boolean;
    wholeWord: boolean;
  }
): Promise<SearchMatch[]> => {
  try {
    const content = await readFileContent(fileHandle);
    const lines = content.split('\n');
    const matches: SearchMatch[] = [];
    
    // 正規表現のフラグを設定
    const flags = options.caseSensitive ? 'g' : 'gi';
    
    // 検索クエリを正規表現に変換
    let searchRegex: RegExp;
    if (options.useRegex) {
      try {
        searchRegex = new RegExp(query, flags);
      } catch (e) {
        console.error('Invalid regex:', e);
        return [];
      }
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
      searchRegex = new RegExp(pattern, flags);
    }
    
    // 各行で検索
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineMatches = [...line.matchAll(searchRegex)];
      
      for (const match of lineMatches) {
        if (match.index !== undefined) {
          matches.push({
            line: i + 1, // 1-based line number
            text: line,
            startCol: match.index,
            endCol: match.index + match[0].length,
            matchText: match[0]
          });
        }
      }
    }
    
    return matches;
  } catch (error) {
    console.error('Error searching in file:', error);
    return [];
  }
};

/**
 * ディレクトリ内のファイルを再帰的に検索する
 */
export const searchInDirectory = async (
  dirHandle: FileSystemDirectoryHandle,
  query: string,
  options: {
    caseSensitive: boolean;
    useRegex: boolean;
    wholeWord: boolean;
    includePattern: string;
    excludePattern: string;
  },
  basePath = '',
  results: SearchResult[] = []
): Promise<SearchResult[]> => {
  try {
    // インクルードパターンとエクスクルードパターンを正規表現に変換
    const includeRegex = options.includePattern ? 
      new RegExp(options.includePattern.replace(/\*/g, '.*')) : null;
    const excludeRegex = options.excludePattern ? 
      new RegExp(options.excludePattern.replace(/\*/g, '.*')) : null;
    
    for await (const [name, handle] of dirHandle.entries()) {
      const path = basePath ? `${basePath}/${name}` : name;
      
      if (handle.kind === 'directory') {
        // ディレクトリの場合は再帰的に検索
        await searchInDirectory(handle as FileSystemDirectoryHandle, query, options, path, results);
      } else if (handle.kind === 'file') {
        // ファイル名がパターンに一致するか確認
        const shouldInclude = !includeRegex || includeRegex.test(name);
        const shouldExclude = excludeRegex && excludeRegex.test(name);
        
        if (shouldInclude && !shouldExclude) {
          // テキストファイルかどうかを簡易チェック（実際はMIMEタイプを確認すべき）
          if (/\.(txt|md|js|ts|jsx|tsx|html|css|json|yaml|yml|xml|svg|csv)$/i.test(name)) {
            const fileHandle = handle as FileSystemFileHandle;
            const matches = await searchInFile(fileHandle, query, options);
            
            if (matches.length > 0) {
              results.push({
                filePath: path,
                fileName: name,
                matches,
                fileHandle
              });
            }
          }
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error searching in directory:', error);
    return results;
  }
};

/**
 * ファイル内のテキストを置換する
 */
export const replaceInFile = async (
  fileHandle: FileSystemFileHandle,
  searchText: string,
  replaceText: string,
  options: {
    caseSensitive: boolean;
    useRegex: boolean;
    wholeWord: boolean;
  }
): Promise<{ content: string, replaceCount: number }> => {
  try {
    const content = await readFileContent(fileHandle);
    
    // 正規表現のフラグを設定
    const flags = options.caseSensitive ? 'g' : 'gi';
    
    // 検索クエリを正規表現に変換
    let searchRegex: RegExp;
    if (options.useRegex) {
      try {
        searchRegex = new RegExp(searchText, flags);
      } catch (e) {
        console.error('Invalid regex:', e);
        return { content, replaceCount: 0 };
      }
    } else {
      const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
      searchRegex = new RegExp(pattern, flags);
    }
    
    // 置換を実行し、置換した数をカウント
    const matches = content.match(searchRegex);
    const replaceCount = matches ? matches.length : 0;
    const newContent = content.replace(searchRegex, replaceText);
    
    // 変更があった場合のみ書き込む
    if (newContent !== content && replaceCount > 0) {
      await writeFileContent(fileHandle, newContent);
    }
    
    return { content: newContent, replaceCount };
  } catch (error) {
    console.error('Error replacing in file:', error);
    return { content: '', replaceCount: 0 };
  }
};

/**
 * ファイル名から拡張子を取得
 */
export const getFileExtension = (fileName: string): string => {
  return fileName.split('.').pop()?.toLowerCase() || '';
};

/**
 * ファイル名からMIMEタイプを推測
 */
export const getMimeType = (fileName: string): string => {
  const ext = getFileExtension(fileName);
  
  switch (ext) {
    case 'html':
    case 'htm':
      return 'text/html';
    case 'css':
      return 'text/css';
    case 'js':
      return 'text/javascript';
    case 'json':
      return 'application/json';
    case 'md':
      return 'text/markdown';
    case 'txt':
      return 'text/plain';
    case 'csv':
      return 'text/csv';
    case 'tsv':
      return 'text/tab-separated-values';
    case 'yaml':
    case 'yml':
      return 'application/x-yaml';
    case 'xml':
      return 'application/xml';
    case 'parquet':
      return 'application/octet-stream';
    default:
      return 'text/plain';
  }
};
