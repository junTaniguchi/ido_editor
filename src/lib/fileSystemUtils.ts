import { FileTreeItem, SearchMatch, SearchResult } from '@/types';
import { gunzipSync, gzipSync, unzipSync, zipSync } from 'fflate';

interface ArchiveEntry {
  path: string;
  type: 'file' | 'dir';
  content?: Uint8Array;
}

const sanitizeRelativePath = (path: string) => {
  const segments = path.split('/').filter(segment => segment && segment !== '.' && segment !== '..');
  return segments.join('/');
};

const ensureDirectory = async (baseDir: FileSystemDirectoryHandle, relativePath: string) => {
  const sanitized = sanitizeRelativePath(relativePath);
  if (!sanitized) {
    return baseDir;
  }

  const segments = sanitized.split('/');
  let currentDir = baseDir;
  for (const segment of segments) {
    currentDir = await currentDir.getDirectoryHandle(segment, { create: true });
  }
  return currentDir;
};

export const ensureHandlePermission = async (
  handle: FileSystemDirectoryHandle | FileSystemFileHandle,
  mode: FileSystemHandlePermissionDescriptor['mode'] = 'read'
): Promise<boolean> => {
  if (!('queryPermission' in handle) || typeof handle.queryPermission !== 'function') {
    return true;
  }

  try {
    const current = await handle.queryPermission({ mode });
    if (current === 'granted') {
      return true;
    }

    if (!('requestPermission' in handle) || typeof handle.requestPermission !== 'function') {
      return false;
    }

    const result = await handle.requestPermission({ mode });
    return result === 'granted';
  } catch (error) {
    console.warn('Failed to check handle permission:', error);
    return false;
  }
};

const extractDirectoryFromFilePath = (filePath: string): string => {
  if (!filePath) {
    return filePath;
  }

  const normalized = filePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  if (index < 0) {
    return normalized;
  }
  return normalized.slice(0, index);
};

const getNativePathFromFileHandle = async (
  fileHandle: FileSystemFileHandle
): Promise<string | null> => {
  try {
    const file = await fileHandle.getFile();
    const path = (file as File & { path?: unknown }).path;
    if (typeof path !== 'string') {
      return null;
    }
    return extractDirectoryFromFilePath(path);
  } catch (error) {
    console.warn('Failed to read native path from file handle:', error);
    return null;
  }
};

export const resolveNativeDirectoryPath = async (
  directoryHandle: FileSystemDirectoryHandle
): Promise<string | null> => {
  try {
    for await (const [, handle] of directoryHandle.entries()) {
      if (handle.kind === 'file') {
        const path = await getNativePathFromFileHandle(handle as FileSystemFileHandle);
        if (path) {
          return path;
        }
      }
    }
  } catch (error) {
    console.warn('Failed to enumerate directory entries for native path resolution:', error);
  }

  const markerName = `.dls-path-marker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let fileHandle: FileSystemFileHandle | null = null;

  try {
    fileHandle = await directoryHandle.getFileHandle(markerName, { create: true });
  } catch (error) {
    console.warn('Failed to create marker file for native path resolution:', error);
    return null;
  }

  try {
    const writable = await fileHandle.createWritable();
    await writable.close();
    const path = await getNativePathFromFileHandle(fileHandle);
    if (!path) {
      console.warn('Marker file does not expose a native path.');
      return null;
    }
    return path;
  } catch (error) {
    console.error('Failed to inspect marker file path:', error);
    return null;
  } finally {
    try {
      await directoryHandle.removeEntry(markerName);
    } catch (cleanupError) {
      console.warn('Failed to remove marker file used for native path resolution:', cleanupError);
    }
  }
};

const isDomException = (error: unknown, name: string): boolean =>
  error instanceof DOMException && error.name === name;

const sanitizeFileName = (name: string) => name.replace(/[\\/]/g, '_');

const generateCopyFileName = async (
  dirHandle: FileSystemDirectoryHandle,
  baseName: string
): Promise<string> => {
  let targetName = baseName;
  let counter = 1;

  while (true) {
    try {
      await dirHandle.getFileHandle(targetName);
      const dotIndex = baseName.lastIndexOf('.');
      const namePart = dotIndex >= 0 ? baseName.slice(0, dotIndex) : baseName;
      const extension = dotIndex >= 0 ? baseName.slice(dotIndex) : '';
      targetName = `${namePart} (${counter})${extension}`;
      counter += 1;
    } catch (error) {
      if (isDomException(error, 'NotFoundError')) {
        break;
      }
      throw error;
    }
  }

  return targetName;
};

export const copyFilesToDirectory = async (
  dirHandle: FileSystemDirectoryHandle,
  files: File[]
): Promise<{ originalName: string; copiedName: string }[]> => {
  if (files.length === 0) {
    return [];
  }

  const hasPermission = await ensureHandlePermission(dirHandle, 'readwrite');
  if (!hasPermission) {
    throw new Error('フォルダへの書き込み権限がありません');
  }

  const copied: { originalName: string; copiedName: string }[] = [];

  for (const file of files) {
    if (!(file instanceof File)) {
      continue;
    }

    const sanitizedName = sanitizeFileName(file.name);
    const targetName = await generateCopyFileName(dirHandle, sanitizedName);
    const fileHandle = await dirHandle.getFileHandle(targetName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();

    copied.push({ originalName: file.name, copiedName: targetName });
  }

  return copied;
};

const writeFileToHandle = async (dirHandle: FileSystemDirectoryHandle, fileName: string, content: Uint8Array) => {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
};

const collectEntriesFromDirectory = async (
  dirHandle: FileSystemDirectoryHandle,
  basePath: string,
  entries: ArchiveEntry[]
) => {
  const normalizedBase = basePath ? `${basePath}/` : '';
  entries.push({ path: `${normalizedBase}`.replace(/\/$/, ''), type: 'dir' });

  for await (const [name, handle] of dirHandle.entries()) {
    const currentPath = `${normalizedBase}${name}`;
    if (handle.kind === 'directory') {
      await collectEntriesFromDirectory(handle as FileSystemDirectoryHandle, currentPath, entries);
    } else {
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const buffer = new Uint8Array(await file.arrayBuffer());
      entries.push({ path: currentPath, type: 'file', content: buffer });
    }
  }
};

const buildTarArchive = (entries: ArchiveEntry[]): Uint8Array => {
  const blocks: Uint8Array[] = [];

  const writeOctal = (buffer: Uint8Array, offset: number, length: number, value: number) => {
    const octal = value.toString(8).padStart(length - 1, '0');
    for (let i = 0; i < length - 1; i++) {
      buffer[offset + i] = i < octal.length ? octal.charCodeAt(i) : 0;
    }
    buffer[offset + length - 1] = 0;
  };

  const writeString = (buffer: Uint8Array, offset: number, length: number, value: string) => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(value);
    const slice = bytes.slice(0, length);
    buffer.set(slice, offset);
  };

  for (const entry of entries) {
    const isDir = entry.type === 'dir';
    const normalizedPath = isDir && !entry.path.endsWith('/') ? `${entry.path}/` : entry.path;
    if (!normalizedPath) continue;

    const header = new Uint8Array(512);
    const encoder = new TextEncoder();

    const fullPathBytes = encoder.encode(normalizedPath);
    let name = normalizedPath;
    let prefix = '';

    if (fullPathBytes.length > 100) {
      const segments = normalizedPath.split('/');
      let tempName = segments.pop() || '';
      let tempPrefix = segments.join('/');
      if (tempName.length > 100 || tempPrefix.length > 155) {
        tempName = normalizedPath.slice(-100);
        tempPrefix = normalizedPath.slice(0, normalizedPath.length - tempName.length).slice(-155);
      }
      name = tempName;
      prefix = tempPrefix;
    }

    writeString(header, 0, 100, name);
    writeOctal(header, 100, 8, isDir ? 0o40755 : 0o100644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    const size = entry.content ? entry.content.length : 0;
    writeOctal(header, 124, 12, size);
    writeOctal(header, 136, 12, Math.floor(Date.now() / 1000));
    // checksum placeholder
    for (let i = 148; i < 156; i++) {
      header[i] = 32; // space
    }
    header[156] = isDir ? 53 : 48; // '5' or '0'
    writeString(header, 257, 6, 'ustar\0');
    writeString(header, 263, 2, '00');
    writeString(header, 265, 32, 'user');
    writeString(header, 297, 32, 'group');
    writeOctal(header, 329, 8, 0);
    writeOctal(header, 337, 8, 0);
    writeString(header, 345, 155, prefix);

    let checksum = 0;
    for (const byte of header) {
      checksum += byte;
    }
    writeOctal(header, 148, 8, checksum);

    blocks.push(header);

    if (!isDir && entry.content) {
      blocks.push(entry.content);
      const remainder = entry.content.length % 512;
      if (remainder !== 0) {
        blocks.push(new Uint8Array(512 - remainder));
      }
    }
  }

  blocks.push(new Uint8Array(512));
  blocks.push(new Uint8Array(512));

  const totalLength = blocks.reduce((sum, block) => sum + block.length, 0);
  const tarArray = new Uint8Array(totalLength);
  let offset = 0;
  for (const block of blocks) {
    tarArray.set(block, offset);
    offset += block.length;
  }
  return tarArray;
};

const parseTarArchive = (data: Uint8Array): ArchiveEntry[] => {
  const entries: ArchiveEntry[] = [];
  const decoder = new TextDecoder();
  const blockSize = 512;

  const readString = (buffer: Uint8Array, offset: number, length: number) => {
    let end = offset;
    while (end < offset + length && buffer[end] !== 0) {
      end++;
    }
    return decoder.decode(buffer.subarray(offset, end));
  };

  const readOctal = (buffer: Uint8Array, offset: number, length: number) => {
    const str = readString(buffer, offset, length).trim();
    return str ? parseInt(str, 8) : 0;
  };

  for (let offset = 0; offset < data.length; ) {
    const header = data.subarray(offset, offset + blockSize);
    const isEmpty = header.every(byte => byte === 0);
    if (isEmpty) {
      break;
    }

    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const sanitized = sanitizeRelativePath(fullName);
    const typeFlag = header[156];
    const size = readOctal(header, 124, 12);

    const contentStart = offset + blockSize;
    const contentEnd = contentStart + size;
    const fileContent = data.subarray(contentStart, contentEnd);

    if (sanitized) {
      if (typeFlag === 53 || fullName.endsWith('/')) {
        entries.push({ path: sanitized.endsWith('/') ? sanitized.slice(0, -1) : sanitized, type: 'dir' });
      } else {
        entries.push({ path: sanitized, type: 'file', content: fileContent.slice() });
      }
    }

    const advance = blockSize + Math.ceil(size / blockSize) * blockSize;
    offset += advance;
  }

  return entries;
};

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
    
    // Excelファイルの場合はArrayBufferとして読み込み、プレースホルダーを返す
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      // Excelファイルは別途処理されるため、プレースホルダーを返す
      return `# Excel File: ${fileHandle.name}\n\nThis is an Excel file. Please use the data preview mode to view its contents.`;
    }
    
    // バイナリファイルの場合
    if (fileName.endsWith('.parquet') || fileName.endsWith('.parq')) {
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

export const extractZipArchive = async (
  fileHandle: FileSystemFileHandle,
  targetDirHandle: FileSystemDirectoryHandle,
  options?: { createSubdirectory?: string }
) => {
  const file = await fileHandle.getFile();
  const buffer = new Uint8Array(await file.arrayBuffer());
  const unzipped = unzipSync(buffer);
  const subDirName = options?.createSubdirectory ? sanitizeRelativePath(options.createSubdirectory) : null;
  const baseDir = subDirName
    ? await targetDirHandle.getDirectoryHandle(subDirName, { create: true })
    : targetDirHandle;

  for (const [rawPath, content] of Object.entries(unzipped)) {
    const sanitized = sanitizeRelativePath(rawPath);
    if (!sanitized) continue;

    const isDirectory = rawPath.endsWith('/');
    let workingPath = sanitized;
    if (subDirName) {
      const prefix = `${subDirName}/`;
      if (workingPath === subDirName) {
        if (isDirectory) {
          continue;
        }
        workingPath = '';
      } else if (workingPath.startsWith(prefix)) {
        workingPath = workingPath.slice(prefix.length);
      }
    }

    if (!workingPath) {
      if (isDirectory) {
        continue;
      }
      workingPath = sanitized.split('/').pop() || sanitized;
    }

    if (!workingPath) {
      continue;
    }

    const segments = workingPath.split('/');
    const fileName = segments.pop();
    const parentPath = segments.join('/');
    const parentDir = await ensureDirectory(baseDir, parentPath);

    if (isDirectory || !fileName) {
      await ensureDirectory(parentDir, fileName || '');
    } else {
      await writeFileToHandle(parentDir, fileName, content);
    }
  }
};

export const extractTarGzArchive = async (
  fileHandle: FileSystemFileHandle,
  targetDirHandle: FileSystemDirectoryHandle,
  options?: { createSubdirectory?: string }
) => {
  const file = await fileHandle.getFile();
  const gzBuffer = new Uint8Array(await file.arrayBuffer());
  const tarBuffer = gunzipSync(gzBuffer);
  const entries = parseTarArchive(tarBuffer);
  const subDirName = options?.createSubdirectory ? sanitizeRelativePath(options.createSubdirectory) : null;
  const baseDir = subDirName
    ? await targetDirHandle.getDirectoryHandle(subDirName, { create: true })
    : targetDirHandle;

  for (const entry of entries) {
    const isDirectory = entry.type === 'dir';
    let workingPath = entry.path;
    if (subDirName) {
      if (workingPath === subDirName) {
        if (isDirectory) {
          continue;
        }
        workingPath = '';
      }
      const prefix = `${subDirName}/`;
      if (workingPath.startsWith(prefix)) {
        workingPath = workingPath.slice(prefix.length);
      }
    }

    if (!workingPath) {
      if (isDirectory) {
        continue;
      }
      workingPath = entry.path.split('/').pop() || entry.path;
    }

    const segments = workingPath.split('/');
    const fileName = segments.pop();
    const parentPath = segments.join('/');
    const parentDir = await ensureDirectory(baseDir, parentPath);

    if (isDirectory || !fileName) {
      await ensureDirectory(parentDir, fileName || '');
    } else if (entry.content) {
      await writeFileToHandle(parentDir, fileName, entry.content);
    }
  }
};

const buildZipArchive = (entries: ArchiveEntry[]): Uint8Array => {
  const zipEntries: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    if (entry.type === 'dir') {
      const dirPath = entry.path.endsWith('/') ? entry.path : `${entry.path}/`;
      zipEntries[dirPath] = new Uint8Array();
    } else if (entry.content) {
      zipEntries[entry.path] = entry.content;
    }
  }
  return zipSync(zipEntries, { level: 6 });
};

export const compressToZip = async (
  itemHandle: FileSystemFileHandle | FileSystemDirectoryHandle,
  targetDirHandle: FileSystemDirectoryHandle,
  archiveName: string,
  entryRootName: string
) => {
  const entries: ArchiveEntry[] = [];
  const rootName = sanitizeRelativePath(entryRootName) || 'archive';

  if (itemHandle.kind === 'directory') {
    await collectEntriesFromDirectory(itemHandle as FileSystemDirectoryHandle, rootName, entries);
  } else {
    const fileHandle = itemHandle as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    const buffer = new Uint8Array(await file.arrayBuffer());
    entries.push({ path: rootName, type: 'file', content: buffer });
  }

  const zipData = buildZipArchive(entries);
  const archiveHandle = await targetDirHandle.getFileHandle(archiveName, { create: true });
  const writable = await archiveHandle.createWritable();
  await writable.write(zipData);
  await writable.close();
};

export const compressToTarGz = async (
  itemHandle: FileSystemFileHandle | FileSystemDirectoryHandle,
  targetDirHandle: FileSystemDirectoryHandle,
  archiveName: string,
  entryRootName: string
) => {
  const entries: ArchiveEntry[] = [];
  const baseName = sanitizeRelativePath(entryRootName) || 'archive';

  if (itemHandle.kind === 'directory') {
    await collectEntriesFromDirectory(itemHandle as FileSystemDirectoryHandle, baseName, entries);
  } else {
    const fileHandle = itemHandle as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    const buffer = new Uint8Array(await file.arrayBuffer());
    entries.push({ path: baseName, type: 'file', content: buffer });
  }

  const tarData = buildTarArchive(entries);
  const gzData = gzipSync(tarData, { level: 6 });
  const archiveHandle = await targetDirHandle.getFileHandle(archiveName, { create: true });
  const writable = await archiveHandle.createWritable();
  await writable.write(gzData);
  await writable.close();
};

/**
 * Excelファイルの内容をArrayBufferとして読み込む
 */
export const readExcelFileContent = async (fileHandle: FileSystemFileHandle): Promise<ArrayBuffer> => {
  try {
    const file = await fileHandle.getFile();
    return await file.arrayBuffer();
  } catch (error) {
    console.error('Error reading Excel file:', error);
    throw new Error('Excelファイルの読み込みに失敗しました');
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
    for await (const [name, handle] of oldDirHandle.entries()) {
      if (handle.kind === 'file') {
        // ファイルをコピー
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const content = await file.text();
        await createNewFile(newDirHandle, name, content);
      } else if (handle.kind === 'directory') {
        // サブディレクトリを再帰的にコピー
        const subDirHandle = await renameDirectory(oldDirHandle, name, name);
        if (subDirHandle) {
          const subDir = await newDirHandle.getDirectoryHandle(name, { create: true });
          // ここで再帰的にサブディレクトリの内容をコピー
          for await (const [subName, subHandle] of (handle as FileSystemDirectoryHandle).entries()) {
            if (subHandle.kind === 'file') {
              const subFileHandle = subHandle as FileSystemFileHandle;
              const subFile = await subFileHandle.getFile();
              const subContent = await subFile.text();
              await createNewFile(subDir, subName, subContent);
            }
          }
        }
      }
    }
    
    // 古いディレクトリを削除
    await deleteDirectory(parentDirHandle, oldName);
    
    return newDirHandle;
  } catch (error) {
    console.error('Error renaming directory:', error);
    return null;
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
