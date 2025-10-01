import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.geojson',
  '.kml',
  '.csv',
  '.tsv',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.css',
  '.js',
  '.ts',
  '.tsx',
]);

const isPathSecure = (root: string, candidate: string) => {
  const normalizedRoot = path.resolve(root);
  const normalizedCandidate = path.resolve(root, candidate);
  return normalizedCandidate.startsWith(normalizedRoot);
};

const readWorkspaceFile = async (relativePath: string) => {
  const workspaceRoot = process.cwd();
  if (!isPathSecure(workspaceRoot, relativePath)) {
    throw new Error('Invalid path');
  }

  const absolutePath = path.resolve(workspaceRoot, relativePath);
  const data = await fs.readFile(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();

  if (TEXT_EXTENSIONS.has(extension)) {
    return { kind: 'text' as const, content: data.toString('utf8') };
  }

  return { kind: 'base64' as const, content: data.toString('base64') };
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawPath = url.searchParams.get('path');

  if (!rawPath || typeof rawPath !== 'string') {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  const sanitized = rawPath.replace(/^\/+/, '');
  if (!sanitized || sanitized.includes('\0')) {
    return NextResponse.json({ error: 'Invalid path parameter' }, { status: 400 });
  }

  try {
    const payload = await readWorkspaceFile(sanitized);
    return NextResponse.json(payload);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    if (error instanceof Error && error.message === 'Invalid path') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    console.error('Failed to read workspace file:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
