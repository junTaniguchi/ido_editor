'use client';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type FileType = 'file' | 'dir';
type SupportedEncoding = 'utf8' | 'utf-8';

export interface FileSystemAccessStat {
  type: FileType;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  mode: number;
  isFile: () => boolean;
  isDirectory: () => boolean;
  isSymbolicLink: () => boolean;
}

const FILE_MODE = 0o100644;
const DIR_MODE = 0o040755;

const normalizePath = (input: string): string => {
  if (!input) return '';
  const replaced = input.replace(/\\/g, '/').replace(/^\.\//, '');
  const trimmed = replaced.replace(/^\/+/, '').replace(/\/+/g, '/');
  const segments = trimmed.split('/').filter(Boolean);
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '.') {
      continue;
    }
    if (segment === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join('/');
};

const createStat = (type: FileType, size: number, mtimeMs: number): FileSystemAccessStat => {
  const mode = type === 'file' ? FILE_MODE : DIR_MODE;
  return {
    type,
    size,
    mtimeMs,
    ctimeMs: mtimeMs,
    mode,
    isFile: () => type === 'file',
    isDirectory: () => type === 'dir',
    isSymbolicLink: () => false,
  };
};

const toUint8Array = (data: Parameters<FileSystemAccessFs['writeFile']>[1]): Uint8Array => {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === 'string') {
    return encoder.encode(data);
  }
  throw new Error('Unsupported data type for writeFile');
};

export class FileSystemAccessFs {
  private readonly root: FileSystemDirectoryHandle;

  constructor(rootHandle: FileSystemDirectoryHandle) {
    this.root = rootHandle;
  }

  private split(path: string): string[] {
    const normalized = normalizePath(path);
    if (!normalized) {
      return [];
    }
    return normalized.split('/');
  }

  private async getDirectoryHandle(segments: string[], create = false): Promise<FileSystemDirectoryHandle> {
    let current = this.root;
    for (const segment of segments) {
      current = await current.getDirectoryHandle(segment, { create });
    }
    return current;
  }

  private async getParentDirectory(path: string, create = false): Promise<{ dir: FileSystemDirectoryHandle; name: string } | null> {
    const segments = this.split(path);
    if (segments.length === 0) {
      return null;
    }
    const name = segments.pop() as string;
    const dir = await this.getDirectoryHandle(segments, create);
    return { dir, name };
  }

  async readFile(path: string, options?: { encoding?: SupportedEncoding } | SupportedEncoding): Promise<Uint8Array | string> {
    const parentInfo = await this.getParentDirectory(path);
    if (!parentInfo) {
      throw new Error(`Cannot read root as file: ${path}`);
    }
    const { dir, name } = parentInfo;
    const fileHandle = await dir.getFileHandle(name);
    const file = await fileHandle.getFile();
    const buffer = new Uint8Array(await file.arrayBuffer());
    const encoding = typeof options === 'string' ? options : options?.encoding;
    if (encoding && encoding.toLowerCase() !== 'utf8' && encoding.toLowerCase() !== 'utf-8') {
      throw new Error(`Unsupported encoding: ${encoding}`);
    }
    if (encoding) {
      return decoder.decode(buffer);
    }
    return buffer;
  }

  async writeFile(path: string, data: Uint8Array | ArrayBuffer | ArrayBufferView | string): Promise<void> {
    const parentInfo = await this.getParentDirectory(path, true);
    if (!parentInfo) {
      throw new Error('Cannot write to repository root directly');
    }
    const { dir, name } = parentInfo;
    const fileHandle = await dir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(toUint8Array(data));
    await writable.close();
  }

  async readdir(path: string): Promise<string[]> {
    const segments = this.split(path);
    const dir = await this.getDirectoryHandle(segments);
    const entries: string[] = [];
    for await (const [name] of dir.entries()) {
      entries.push(name);
    }
    return entries;
  }

  async mkdir(path: string): Promise<void> {
    const segments = this.split(path);
    await this.getDirectoryHandle(segments, true);
  }

  async rmdir(path: string): Promise<void> {
    const parentInfo = await this.getParentDirectory(path);
    if (!parentInfo) {
      return;
    }
    const { dir, name } = parentInfo;
    await dir.removeEntry(name, { recursive: true });
  }

  async unlink(path: string): Promise<void> {
    const parentInfo = await this.getParentDirectory(path);
    if (!parentInfo) {
      return;
    }
    const { dir, name } = parentInfo;
    await dir.removeEntry(name);
  }

  async stat(path: string): Promise<FileSystemAccessStat> {
    if (!path || path === '/' || path === '.') {
      return createStat('dir', 0, Date.now());
    }
    const parentInfo = await this.getParentDirectory(path);
    if (!parentInfo) {
      return createStat('dir', 0, Date.now());
    }
    const { dir, name } = parentInfo;
    try {
      const fileHandle = await dir.getFileHandle(name);
      const file = await fileHandle.getFile();
      return createStat('file', file.size, file.lastModified);
    } catch (fileError) {
      try {
        await dir.getDirectoryHandle(name);
        return createStat('dir', 0, Date.now());
      } catch (dirError) {
        throw fileError instanceof Error ? fileError : new Error(`Unable to stat path: ${path}`);
      }
    }
  }

  async lstat(path: string): Promise<FileSystemAccessStat> {
    return this.stat(path);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async delete(path: string, options: { recursive?: boolean } = {}): Promise<void> {
    const parentInfo = await this.getParentDirectory(path);
    if (!parentInfo) {
      return;
    }
    const { dir, name } = parentInfo;
    await dir.removeEntry(name, { recursive: options.recursive ?? false });
  }

  getFs(): any {
    const promises = {
      readFile: this.readFile.bind(this),
      writeFile: this.writeFile.bind(this),
      readdir: this.readdir.bind(this),
      mkdir: this.mkdir.bind(this),
      rmdir: this.rmdir.bind(this),
      unlink: this.unlink.bind(this),
      stat: this.stat.bind(this),
      lstat: this.lstat.bind(this),
    };

    return {
      promises,
      readFile: promises.readFile,
      writeFile: promises.writeFile,
      readdir: promises.readdir,
      mkdir: promises.mkdir,
      rmdir: promises.rmdir,
      unlink: promises.unlink,
      stat: promises.stat,
      lstat: promises.lstat,
    };
  }
}

export type { FileSystemAccessFs as FileSystemAccessAdapter };
