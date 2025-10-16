export type GoogleWorkspaceFileType = 'gdoc' | 'gsheet' | 'gslides';

export interface GoogleWorkspaceInfo {
  docId: string | null;
  originalUrl: string | null;
  embedUrl: string | null;
  title: string | null;
  metadata: Record<string, unknown> | null;
  error: string | null;
}

const TYPE_PATH_MAP: Record<GoogleWorkspaceFileType, string> = {
  gdoc: 'document',
  gsheet: 'spreadsheets',
  gslides: 'presentation',
};

const buildEmbedUrlFromDocId = (type: GoogleWorkspaceFileType, docId: string): string => {
  const base = `https://docs.google.com/${TYPE_PATH_MAP[type]}/d/${docId}`;
  switch (type) {
    case 'gdoc':
      return `${base}/preview`;
    case 'gsheet':
      return `${base}/htmlembed?widget=false&headers=false`;
    case 'gslides':
      return `${base}/embed?rm=minimal`;
    default:
      return base;
  }
};

const extractDocIdFromResource = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const [, id] = value.split(':');
  return (id || value).trim() || null;
};

const extractDocIdFromUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }
  } catch {
    // ignore parsing errors
  }
  return null;
};

const normalizeEmbedUrl = (
  type: GoogleWorkspaceFileType,
  originalUrl: string | null,
  docId: string | null,
): string | null => {
  if (docId) {
    return buildEmbedUrlFromDocId(type, docId);
  }
  if (!originalUrl) {
    return null;
  }

  if (type === 'gdoc' && !/\/preview($|\?)/.test(originalUrl)) {
    return originalUrl.replace(/\/edit[^/]*$/, '/preview');
  }
  if (type === 'gsheet' && !/\/htmlembed/.test(originalUrl)) {
    return originalUrl.replace(/\/edit[^/]*$/, '/htmlembed?widget=false&headers=false');
  }
  if (type === 'gslides' && !/\/embed/.test(originalUrl)) {
    return originalUrl.replace(/\/edit[^/]*$/, '/embed?rm=minimal');
  }
  return originalUrl;
};

export const parseGoogleWorkspaceContent = (
  raw: string,
  type: GoogleWorkspaceFileType,
): GoogleWorkspaceInfo => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      docId: null,
      originalUrl: null,
      embedUrl: null,
      title: null,
      metadata: null,
      error: 'Google WorkspaceファイルにURL情報が含まれていません。',
    };
  }

  try {
    const parsed = JSON.parse(trimmed);
    const metadata = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;

    const explicitDocId =
      (typeof metadata?.doc_id === 'string' && metadata.doc_id) ||
      (typeof metadata?.docId === 'string' && metadata.docId) ||
      (typeof metadata?.id === 'string' && metadata.id) ||
      extractDocIdFromResource(metadata?.resource_id);

    const originalUrl =
      (typeof metadata?.url === 'string' && metadata.url) ||
      (typeof metadata?.alternateLink === 'string' && metadata.alternateLink) ||
      null;

    const docId = explicitDocId || (originalUrl ? extractDocIdFromUrl(originalUrl) : null);
    const embedUrl = normalizeEmbedUrl(type, originalUrl, docId);
    const title =
      (typeof metadata?.title === 'string' && metadata.title) ||
      (typeof metadata?.name === 'string' && metadata.name) ||
      null;

    return {
      docId: docId || null,
      originalUrl,
      embedUrl,
      title,
      metadata,
      error: null,
    };
  } catch (error) {
    console.error('Failed to parse Google Workspace descriptor:', error);
    return {
      docId: null,
      originalUrl: null,
      embedUrl: null,
      title: null,
      metadata: null,
      error: 'Google Workspaceファイルの内容を解析できませんでした。',
    };
  }
};
