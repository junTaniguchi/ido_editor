
/**
 * FileExplorer.tsx
 * このファイルは、ローカル/仮想ファイルシステムのディレクトリ・ファイル構造をツリー表示し、
 * ファイル操作（新規作成・削除・リネーム・選択・右クリックメニュー）を行うReactコンポーネントを提供します。
 * 主な機能:
 * - ディレクトリ・ファイルのツリー表示
 * - ファイル/フォルダの新規作成・削除・リネーム
 * - 右クリックメニューによる操作
 * - ダイアログによる入力・確認
 */
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  IoFolderOutline,
  IoDocumentOutline,
  IoChevronForward,
  IoChevronDown,
  IoCreateOutline,
  IoReloadOutline,
  IoSyncOutline,
  IoCopyOutline,
} from 'react-icons/io5';
import { useEditorStore } from '@/store/editorStore';
import { useGitStore } from '@/store/gitStore';
import { 
  readFileContent, 
  readDirectoryContents, 
  createNewFile, 
  createNewDirectory, 
  deleteFile, 
  deleteDirectory, 
  renameFile, 
  renameDirectory,
  extractZipArchive,
  extractTarGzArchive,
  compressToZip,
  compressToTarGz,
  copyFilesToDirectory,
  ensureHandlePermission,
} from '@/lib/fileSystemUtils';
import { getFileType } from '@/lib/editorUtils';
import { getMermaidTemplate } from '@/lib/mermaid/diagramDefinitions';
import { FileTreeItem, TabData } from '@/types';
import ContextMenu from '@/components/modals/ContextMenu';
import InputDialog from '@/components/modals/InputDialog';
import ConfirmDialog from '@/components/modals/ConfirmDialog';
import MermaidTemplateDialog from '@/components/modals/MermaidTemplateDialog';
import type { MermaidDiagramType } from '@/lib/mermaid/types';

/**
 * FileExplorerコンポーネント
 * ファイル/フォルダのツリー表示と各種ファイル操作を提供する。
 * - ディレクトリ・ファイルのツリー表示
 * - ファイル/フォルダの新規作成・削除・リネーム
 * - 右クリックメニューによる操作
 * - ダイアログによる入力・確認
 */
const FileExplorer = () => {
  const {
    rootFileTree,
    rootDirHandle,
    rootFolderName,
    setRootDirHandle,
    setRootFileTree,
    setRootFolderName,
    addTab,
    addTempTab,
    activeTabId,
    setActiveTabId,
    updateTab,
    tabs,
    setContextMenuTarget,
    contextMenuTarget,
    multiFileAnalysisEnabled,
    selectedFiles,
    addSelectedFile,
    removeSelectedFile,
  } = useEditorStore();
  const setGitRootDirectory = useGitStore((state) => state.setRootDirectory);
  // Avoid returning an object literal from the selector which creates a new
  // reference on each render and can cause infinite update loops. Select
  // individual properties instead so selectors are stable.
  const repoInitialized = useGitStore((state) => state.repoInitialized);
  const getFileHistory = useGitStore((state) => state.getFileHistory);
  const gitLoading = useGitStore((state) => state.loading);
  
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [apiSupported, setApiSupported] = useState<boolean>(true);
  const [isCopyingStructure, setIsCopyingStructure] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const copyMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const copyMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const copyMenuContentRef = useRef<HTMLDivElement | null>(null);
  const [copyMenuPosition, setCopyMenuPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [copyTarget, setCopyTarget] = useState<'directoriesOnly' | 'directoriesAndFiles'>(
    'directoriesAndFiles',
  );
  const [copyFormat, setCopyFormat] = useState<'tree' | 'table'>('tree');
  const [fileManagerLabel, setFileManagerLabel] = useState('ファイルマネージャーで表示');
  
  // モーダル関連の状態
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showInputDialog, setShowInputDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [inputDialogMode, setInputDialogMode] = useState<'newFile' | 'newFolder' | 'rename' | 'tempFile'>('newFile');
  const [inputDialogInitialValue, setInputDialogInitialValue] = useState('');
  const [selectedItem, setSelectedItem] = useState<FileTreeItem | null>(null);
  const [showMermaidTemplateDialog, setShowMermaidTemplateDialog] = useState(false);
  const [pendingMermaidFile, setPendingMermaidFile] = useState<{
    fileName: string;
    directoryHandle: FileSystemDirectoryHandle | null;
    mode: 'newFile' | 'tempFile';
  } | null>(null);

  // コンポーネントマウント時にAPIサポートを確認
  useEffect(() => {
    // File System Access APIのサポートを確認
    if (!('showDirectoryPicker' in window)) {
      setApiSupported(false);
      console.warn('File System Access API is not supported in this browser.');
    }
  }, []);

  useEffect(() => {
    if (!rootFileTree) {
      return;
    }

    setExpandedFolders((previous) => {
      if (previous.size === 1 && previous.has(rootFileTree.path)) {
        return previous;
      }
      return new Set([rootFileTree.path]);
    });
  }, [rootFileTree]);

  useEffect(() => {
    if (typeof navigator === 'undefined') {
      return;
    }

    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
    const lower = platform.toLowerCase();

    if (lower.includes('mac')) {
      setFileManagerLabel('Finderで表示');
    } else if (lower.includes('win')) {
      setFileManagerLabel('エクスプローラで表示');
    } else {
      setFileManagerLabel('ファイルマネージャーで表示');
    }
  }, []);

  // フォルダ内容を更新する関数
  const refreshFolderContents = useCallback(async (dirHandle: FileSystemDirectoryHandle | null = null) => {
    try {
      const targetDirHandle = dirHandle || rootDirHandle;
      if (!targetDirHandle) return;
      
      const fileTree = await readDirectoryContents(targetDirHandle);
      setRootFileTree(fileTree);
      const gitState = useGitStore.getState();
      if (gitState.fsAdapter) {
        try {
          await gitState.refreshRepository();
        } catch (gitError) {
          console.warn('Failed to refresh Git repository state:', gitError);
        }
      }
    } catch (error) {
      console.error('Failed to refresh directory contents:', error);
      alert(`フォルダの内容を更新できませんでした: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [rootDirHandle, setRootFileTree]);

  // フォルダの選択処理
  const handleSelectFolder = async () => {
    try {
      // File System Access APIがサポートされているか確認
      if (!('showDirectoryPicker' in window)) {
        alert('このブラウザはFile System Access APIをサポートしていません。最新のChrome、Edge、またはChromiumベースのブラウザをご使用ください。');
        return;
      }
      
      // ファイルシステムアクセスAPIを使用してフォルダを選択
      // @ts-ignore - TypeScriptの型定義エラーを無視
      const dirHandle = await window.showDirectoryPicker();
      setRootDirHandle(dirHandle);
      await setGitRootDirectory(dirHandle);
      setRootFolderName(dirHandle.name);
      
      // フォルダ内容を読み込む
      try {
        const fileTree = await readDirectoryContents(dirHandle);
        setRootFileTree(fileTree);
        // ルートフォルダを展開状態にする
        setExpandedFolders(new Set([fileTree.path]));
      } catch (readError) {
        console.error('Failed to read directory contents:', readError);
        alert(`フォルダの内容を読み込めませんでした: ${readError instanceof Error ? readError.message : 'Unknown error'}`);
      }
    } catch (error) {
      // ユーザーがキャンセルした場合は静かにリターン（エラーログを出力しない）
      if (error instanceof Error && error.name === 'AbortError') {
        // キャンセルは正常な操作なのでログを出さない
        return;
      }
      
      // その他のエラーはログを出力し、ユーザーにフィードバックを提供
      console.error('Failed to select folder:', error);
      alert(`フォルダの選択中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  };

  // フォルダの展開状態を切り替え
  const toggleFolder = (path: string) => {
    const newExpandedFolders = new Set(expandedFolders);
    if (newExpandedFolders.has(path)) {
      newExpandedFolders.delete(path);
    } else {
      newExpandedFolders.add(path);
    }
    setExpandedFolders(newExpandedFolders);
  };
  
  // ファイルをクリックしたときの処理
  const handleFileClick = async (item: FileTreeItem, event?: React.MouseEvent) => {
    if (!item.fileHandle) return;
    
    // 複数ファイル分析モードが有効な場合
    if (multiFileAnalysisEnabled) {
      // データファイルのみ選択可能
      const dataFileTypes = [
        'csv',
        'tsv',
        'json',
        'yaml',
        'yml',
        'xlsx',
        'xls',
        'geojson',
        'kml',
        'kmz',
        'shp',
        'shpz',
        'shz',
        'zip',
      ];
      const extension = item.name.split('.').pop()?.toLowerCase();
      
      if (extension && dataFileTypes.includes(extension)) {
        if (selectedFiles.has(item.path)) {
          removeSelectedFile(item.path);
        } else {
          addSelectedFile(item.path);
        }
      }
      return;
    }
    
    // 通常モード：タブとして開く
    const lowerName = item.name.toLowerCase();
    if (lowerName.endsWith('.exe')) {
      alert('EXEファイルはプレビューに対応していません。');
      return;
    }
    if (lowerName.endsWith('.dmg')) {
      alert('DMGファイルはプレビューに対応していません。');
      return;
    }

    // 既に開いているタブがあるか確認
    let existingTabId: string | undefined;
    
    for (const [id, tab] of tabs.entries()) {
      if (tab.name === item.name || tab.name === item.path) {
        existingTabId = id;
        break;
      }
    }
    
    if (existingTabId) {
      // 既存のタブがあればアクティブにする
      setActiveTabId(existingTabId);
    } else {
      // 新しいタブを作成
      try {
        const fileType = getFileType(item.name);
        
        let content: string | ArrayBuffer = '';

        if (fileType === 'excel' || fileType === 'pptx') {
          content = '';
        } else if (fileType === 'pdf') {
          const file = await item.fileHandle.getFile();
          content = URL.createObjectURL(file);
        } else if (fileType === 'shapefile') {
          content = `# Shapefile: ${item.name}\n\nこのファイルはバイナリGISデータです。データプレビューや分析タブで属性情報を確認してください。`;
        } else if (fileType === 'kmz') {
          content = `# KMZ: ${item.name}\n\nKMZは圧縮されたKMLファイルです。データプレビューや分析タブで展開して読み込めます。`;
        } else {
          content = await readFileContent(item.fileHandle);
        }
        
        const newTab: TabData = {
          id: item.path,
          name: item.name,
          content,
          originalContent: content,
          isDirty: false,
          type: fileType,
          isReadOnly: false,
          file: item.fileHandle,
        };
        
        addTab(newTab);
        setActiveTabId(newTab.id);
      } catch (error) {
        console.error('Failed to read file:', error);
      }
    }
  };
  
  // コンテキストメニューを表示
  const handleContextMenu = (e: React.MouseEvent, item: FileTreeItem) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setSelectedItem(item);
    setShowContextMenu(true);
  };
  
  // コンテキストメニューを閉じる
  const handleCloseContextMenu = () => {
    setShowContextMenu(false);
  };

  const hasFileItems = (dataTransfer: DataTransfer | null): boolean => {
    if (!dataTransfer) {
      return false;
    }

    if (dataTransfer.items && dataTransfer.items.length > 0) {
      return Array.from(dataTransfer.items).some((item) => item.kind === 'file');
    }

    return dataTransfer.files.length > 0;
  };

  const collectFilesFromDataTransfer = (dataTransfer: DataTransfer | null): File[] => {
    if (!dataTransfer) {
      return [];
    }

    if (dataTransfer.items && dataTransfer.items.length > 0) {
      const files: File[] = [];
      for (const item of Array.from(dataTransfer.items)) {
        if (item.kind !== 'file') {
          continue;
        }
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
      if (files.length > 0) {
        return files;
      }
    }

    return Array.from(dataTransfer.files || []);
  };

  const handleDragOverForFileCopy = (
    event: React.DragEvent,
    canHandle: boolean
  ) => {
    if (!canHandle) {
      return;
    }

    const dataTransfer = event.dataTransfer;
    if (!hasFileItems(dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (dataTransfer) {
      dataTransfer.dropEffect = 'copy';
    }
  };

  // ルートフォルダに新規ファイルを作成する
  const handleNewFileInRoot = () => {
    if (rootDirHandle) {
      // ルートディレクトリが選択されている場合
      setSelectedItem(rootFileTree);
      
      // 新規ファイル作成ダイアログを表示
      setInputDialogMode('newFile');
      setInputDialogInitialValue('');
      setShowInputDialog(true);
    } else {
      // ルートディレクトリが選択されていない場合は一時ファイル作成ダイアログを表示
      setInputDialogMode('tempFile');
      setInputDialogInitialValue('');
      setShowInputDialog(true);
    }
  };
  
  // 新規ファイル作成ダイアログを表示
  const handleNewFile = () => {
    if (!selectedItem || !selectedItem.isDirectory) return;
    
    setInputDialogMode('newFile');
    setInputDialogInitialValue('');
    setShowInputDialog(true);
  };
  
  // 新規フォルダ作成ダイアログを表示
  const handleNewFolder = () => {
    if (!selectedItem || !selectedItem.isDirectory) return;
    
    setInputDialogMode('newFolder');
    setInputDialogInitialValue('');
    setShowInputDialog(true);
  };
  
  // リネームダイアログを表示
  const handleRename = () => {
    if (!selectedItem) return;
    
    setInputDialogMode('rename');
    setInputDialogInitialValue(selectedItem.name);
    setShowInputDialog(true);
  };
  
  // 削除確認ダイアログを表示
  const handleDelete = () => {
    if (!selectedItem) return;
    
    setShowConfirmDialog(true);
  };

  type ArchiveFormat = 'zip' | 'tar.gz';

  const getParentDirectoryHandleForItem = useCallback(
    async (item: FileTreeItem): Promise<FileSystemDirectoryHandle | null> => {
      if (!rootDirHandle) return null;
      if (!item.path) {
        return rootDirHandle;
      }

      const segments = item.path.split('/').filter(segment => segment);
      if (segments.length > 0) {
        segments.pop();
      }

      let currentHandle: FileSystemDirectoryHandle = rootDirHandle;
      for (const segment of segments) {
        currentHandle = await currentHandle.getDirectoryHandle(segment);
      }
      return currentHandle;
    },
    [rootDirHandle],
  );

  const copyFilesIntoDirectory = useCallback(
    async (
      directoryHandle: FileSystemDirectoryHandle | null | undefined,
      files: File[],
    ) => {
      if (!directoryHandle || files.length === 0) {
        return;
      }

      try {
        await copyFilesToDirectory(directoryHandle, files);
        await refreshFolderContents();
      } catch (error) {
        console.error('Failed to copy dropped files:', error);
        alert(`ファイルのコピーに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
    [refreshFolderContents],
  );

  const handleDirectoryDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>, item: FileTreeItem) => {
      const dataTransfer = event.dataTransfer;
      if (!hasFileItems(dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const files = collectFilesFromDataTransfer(dataTransfer);
      if (files.length === 0) {
        return;
      }

      const targetHandle = item.directoryHandle ?? rootDirHandle;
      await copyFilesIntoDirectory(targetHandle, files);
    },
    [copyFilesIntoDirectory, rootDirHandle],
  );

  const handleFileDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>, item: FileTreeItem) => {
      const dataTransfer = event.dataTransfer;
      if (!hasFileItems(dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const files = collectFilesFromDataTransfer(dataTransfer);
      if (files.length === 0) {
        return;
      }

      const parentHandle = await getParentDirectoryHandleForItem(item);
      await copyFilesIntoDirectory(parentHandle, files);
    },
    [copyFilesIntoDirectory, getParentDirectoryHandleForItem],
  );

  const handleRootDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      const dataTransfer = event.dataTransfer;
      if (!hasFileItems(dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const files = collectFilesFromDataTransfer(dataTransfer);
      if (files.length === 0) {
        return;
      }

      await copyFilesIntoDirectory(rootDirHandle, files);
    },
    [copyFilesIntoDirectory, rootDirHandle],
  );

  const handleRevealInFileManager = useCallback(async () => {
    if (!selectedItem) {
      return;
    }

    if (!rootDirHandle) {
      alert('フォルダが選択されていません。');
      return;
    }

    const showDirectoryPicker = (window as typeof window & {
      showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;

    if (typeof showDirectoryPicker !== 'function') {
      alert('この環境ではファイルマネージャーでの表示に対応していません。');
      return;
    }

    try {
      let directoryToOpen: FileSystemDirectoryHandle | null | undefined = null;
      if (selectedItem.isDirectory) {
        directoryToOpen = selectedItem.directoryHandle ?? rootDirHandle;
      } else {
        directoryToOpen = await getParentDirectoryHandleForItem(selectedItem);
      }

      if (!directoryToOpen) {
        throw new Error('対象のフォルダを取得できませんでした');
      }

      const granted = await ensureHandlePermission(directoryToOpen, 'read');
      if (!granted) {
        alert('フォルダへのアクセスが許可されませんでした。');
        return;
      }

      await showDirectoryPicker({ startIn: directoryToOpen });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('Failed to reveal item in file manager:', error);
      alert(`ファイルマネージャーの表示に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [getParentDirectoryHandleForItem, rootDirHandle, selectedItem]);

  const deriveArchiveBaseName = (name: string, format: ArchiveFormat) => {
    if (format === 'zip') {
      return /\.zip$/i.test(name) ? name.replace(/\.zip$/i, '') : `${name}_extracted`;
    }
    return /\.tar\.gz$/i.test(name) ? name.replace(/\.tar\.gz$/i, '') : `${name}_extracted`;
  };

  const buildArchiveFileName = (name: string, format: ArchiveFormat) => {
    const lower = name.toLowerCase();
    if (format === 'zip') {
      return lower.endsWith('.zip') ? `${name}_archive.zip` : `${name}.zip`;
    }
    return lower.endsWith('.tar.gz') ? `${name}_archive.tar.gz` : `${name}.tar.gz`;
  };

  const handleExtractArchive = async (format: ArchiveFormat) => {
    if (!selectedItem || !selectedItem.fileHandle) return;

    try {
      const parentHandle = await getParentDirectoryHandleForItem(selectedItem);
      if (!parentHandle) {
        throw new Error('親フォルダを取得できませんでした');
      }

      const baseName = deriveArchiveBaseName(selectedItem.name, format);

      if (format === 'zip') {
        await extractZipArchive(selectedItem.fileHandle, parentHandle, { createSubdirectory: baseName });
      } else {
        await extractTarGzArchive(selectedItem.fileHandle, parentHandle, { createSubdirectory: baseName });
      }

      await refreshFolderContents(parentHandle);
    } catch (error) {
      console.error('Failed to extract archive:', error);
      alert(`解凍に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCompressArchive = async (format: ArchiveFormat) => {
    if (!selectedItem) return;

    try {
      const parentHandle = await getParentDirectoryHandleForItem(selectedItem);
      if (!parentHandle) {
        throw new Error('親フォルダを取得できませんでした');
      }

      const targetHandle = selectedItem.isDirectory ? selectedItem.directoryHandle : selectedItem.fileHandle;
      if (!targetHandle) {
        throw new Error('対象のハンドルが見つかりません');
      }

      const archiveName = buildArchiveFileName(selectedItem.name, format);

      if (format === 'zip') {
        await compressToZip(targetHandle, parentHandle, archiveName, selectedItem.name);
      } else {
        await compressToTarGz(targetHandle, parentHandle, archiveName, selectedItem.name);
      }

      await refreshFolderContents(parentHandle);
    } catch (error) {
      console.error('Failed to compress:', error);
      alert(`圧縮に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleShowGitHistory = useCallback(async () => {
    if (!selectedItem || selectedItem.isDirectory || !selectedItem.path) {
      return;
    }
    if (!repoInitialized) {
      setShowContextMenu(false);
      alert('Gitリポジトリが初期化されていません。');
      return;
    }

    setShowContextMenu(false);

    try {
      const history = await getFileHistory(selectedItem.path);
      const historyContent = JSON.stringify({
        filePath: selectedItem.path,
        fileName: selectedItem.name,
        commits: history,
      });
      const tabId = `git-history:${selectedItem.path}`;
      const tabName = `${selectedItem.name} の履歴`;
      const existingTab = tabs.get(tabId);

      if (existingTab) {
        updateTab(tabId, {
          content: historyContent,
          originalContent: historyContent,
          isDirty: false,
          type: 'git-history',
          isReadOnly: true,
        });
        setActiveTabId(tabId);
      } else {
        addTab({
          id: tabId,
          name: tabName,
          content: historyContent,
          originalContent: historyContent,
          isDirty: false,
          type: 'git-history',
          isReadOnly: true,
        });
      }
    } catch (error) {
      console.error('Failed to load Git history:', error);
      alert(`コミット履歴の取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [addTab, getFileHistory, repoInitialized, selectedItem, setActiveTabId, tabs, updateTab]);
  
  // 入力ダイアログの確認処理
  const handleInputConfirm = async (value: string) => {
    setShowInputDialog(false);

    try {
      // ファイル名が空の場合 Untitled にする
      let finalValue = value;
      if (!finalValue.trim()) {
        // 拡張子を取得（InputDialogの拡張子選択機能で .md などが付与されている想定）
        // valueが空の場合は Untitled.md などにする
        if (inputDialogMode === 'newFile' || inputDialogMode === 'tempFile') {
          // extensionsリストの最初をデフォルト拡張子とする
          const defaultExt = 'md';
          finalValue = `Untitled.${defaultExt}`;
        } else {
          finalValue = 'Untitled';
        }
      }

      if (inputDialogMode === 'tempFile') {
        const parts = finalValue.split('.');
        const fileType = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'md';
        if (fileType === 'mmd') {
          setPendingMermaidFile({ fileName: finalValue, directoryHandle: null, mode: 'tempFile' });
          setShowMermaidTemplateDialog(true);
          return;
        }
        addTempTab(fileType, finalValue);
        return;
      }

      if (!selectedItem || !rootDirHandle) return;

      if (inputDialogMode === 'newFile') {
        if (!selectedItem.directoryHandle) return;

        const fileType = getFileType(finalValue);
        if (fileType === 'mermaid' || finalValue.toLowerCase().endsWith('.mmd')) {
          setPendingMermaidFile({
            fileName: finalValue,
            directoryHandle: selectedItem.directoryHandle,
            mode: 'newFile',
          });
          setShowMermaidTemplateDialog(true);
          return;
        }

        await createNewFile(selectedItem.directoryHandle, finalValue, '');
        await refreshFolderContents();
      } else if (inputDialogMode === 'newFolder') {
        // 新規フォルダ作成
        if (!selectedItem.directoryHandle) return;
        
        await createNewDirectory(selectedItem.directoryHandle, value);
        await refreshFolderContents();
        
      } else if (inputDialogMode === 'rename') {
        // ファイル/フォルダのリネーム
        const pathParts = selectedItem.path.split('/');
        const parentPath = pathParts.slice(0, -1).join('/');
        
        // 親ディレクトリのハンドルを取得
        let parentDirHandle = rootDirHandle;
        const pathSegments = parentPath.split('/').filter(segment => segment);
        
        for (const segment of pathSegments) {
          parentDirHandle = await parentDirHandle.getDirectoryHandle(segment);
        }
        
        if (selectedItem.isDirectory) {
          // ディレクトリのリネーム
          await renameDirectory(parentDirHandle, selectedItem.name, value);
        } else {
          // ファイルのリネーム
          await renameFile(parentDirHandle, selectedItem.name, value);
        }
        
        await refreshFolderContents();
      }
    } catch (error) {
      console.error('Failed to perform file operation:', error);
      alert(`操作に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleMermaidTemplateCancel = useCallback(() => {
    setPendingMermaidFile(null);
    setShowMermaidTemplateDialog(false);
  }, []);

  const handleMermaidTemplateConfirm = useCallback(
    async (diagramType: MermaidDiagramType, generatedCode?: string) => {
      if (!pendingMermaidFile) return;

      const template = generatedCode ?? getMermaidTemplate(diagramType);

      try {
        if (pendingMermaidFile.mode === 'newFile') {
          const directoryHandle = pendingMermaidFile.directoryHandle;
          if (!directoryHandle) {
            throw new Error('ディレクトリハンドルが見つかりません');
          }
          const fileHandle = await createNewFile(directoryHandle, pendingMermaidFile.fileName, template);
          if (!fileHandle) {
            throw new Error('ファイルハンドルを取得できませんでした');
          }
          await refreshFolderContents();
        } else {
          const parts = pendingMermaidFile.fileName.split('.');
          const fileType = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'mmd';
          addTempTab(fileType, pendingMermaidFile.fileName, template);
        }
      } catch (error) {
        console.error('Failed to create Mermaid file:', error);
        alert(`Mermaidファイルの作成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
      } finally {
        setPendingMermaidFile(null);
        setShowMermaidTemplateDialog(false);
      }
    },
    [addTempTab, pendingMermaidFile, refreshFolderContents],
  );
  
  // 削除確認ダイアログの確認処理
  const handleDeleteConfirm = async () => {
    if (!selectedItem || !rootDirHandle) return;
    
    setShowConfirmDialog(false);
    
    try {
      const pathParts = selectedItem.path.split('/');
      const parentPath = pathParts.slice(0, -1).join('/');
      
      // 親ディレクトリのハンドルを取得
      let parentDirHandle = rootDirHandle;
      const pathSegments = parentPath.split('/').filter(segment => segment);
      
      for (const segment of pathSegments) {
        parentDirHandle = await parentDirHandle.getDirectoryHandle(segment);
      }
      
      if (selectedItem.isDirectory) {
        // ディレクトリの削除
        await deleteDirectory(parentDirHandle, selectedItem.name);
      } else {
        // ファイルの削除
        await deleteFile(parentDirHandle, selectedItem.name);
      }
      
      await refreshFolderContents();
    } catch (error) {
      console.error('Failed to delete:', error);
      alert(`削除に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  
  // 入力値の検証
  const validateFileName = (value: string): string | null => {
    if (!value.trim()) {
      return '名前を入力してください';
    }
    
    if (value.includes('/') || value.includes('\\')) {
      return 'ファイル名に / や \\ を含めることはできません';
    }
    
    if (value.startsWith('.')) {
      return 'ファイル名は . で始めることはできません';
    }
    
    return null;
  };
  
  // ファイルツリーを再帰的に描画
  const renderFileTree = (item: FileTreeItem, level = 0) => {
    const isExpanded = expandedFolders.has(item.path);
    const paddingLeft = `${level * 12 + 4}px`;
    
    if (item.isDirectory) {
      return (
        <div key={item.path}>
          <div
            className="flex items-center py-1 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"
            style={{ paddingLeft }}
            onClick={() => toggleFolder(item.path)}
            onContextMenu={(e) => handleContextMenu(e, item)}
            onDragOver={(event) =>
              handleDragOverForFileCopy(event, Boolean(item.directoryHandle ?? rootDirHandle))
            }
            onDrop={(event) => {
              void handleDirectoryDrop(event, item);
            }}
          >
            <span className="mr-1">
              {isExpanded ? <IoChevronDown size={16} /> : <IoChevronForward size={16} />}
            </span>
            <IoFolderOutline className="mr-1 text-yellow-500" size={16} />
            <span className="truncate">{item.name}</span>
          </div>
          
          {isExpanded && item.children && (
            <div>
              {item.children.map(child => renderFileTree(child, level + 1))}
            </div>
          )}
        </div>
      );
    } else {
      // ファイルの拡張子をチェック
      const extension = item.name.split('.').pop()?.toLowerCase();
      const isDataFile = extension && ['csv', 'tsv', 'json', 'yaml', 'yml', 'xlsx', 'xls'].includes(extension);
      const isSelected = selectedFiles.has(item.path);
      
      // 複数ファイル分析モードの場合のスタイル
      let fileClassName = "flex items-center py-1 cursor-pointer";
      
      if (multiFileAnalysisEnabled) {
        if (isDataFile) {
          if (isSelected) {
            fileClassName += " bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200";
          } else {
            fileClassName += " hover:bg-blue-50 dark:hover:bg-blue-900/30";
          }
        } else {
          fileClassName += " opacity-50 cursor-not-allowed";
        }
      } else {
        fileClassName += " hover:bg-gray-200 dark:hover:bg-gray-700";
      }

      return (
        <div
          key={item.path}
          className={fileClassName}
          style={{ paddingLeft }}
          onClick={() => handleFileClick(item)}
          onContextMenu={(e) => handleContextMenu(e, item)}
          onDragOver={(event) => handleDragOverForFileCopy(event, Boolean(rootDirHandle))}
          onDrop={(event) => {
            void handleFileDrop(event, item);
          }}
          title={multiFileAnalysisEnabled && !isDataFile ? 'データファイルではないため選択できません' : undefined}
        >
          <IoDocumentOutline 
            className={`mr-1 ${
              multiFileAnalysisEnabled && isSelected 
                ? 'text-blue-600' 
                : isDataFile 
                  ? 'text-blue-500' 
                  : 'text-gray-400'
            }`} 
            size={16} 
          />
          <span className="truncate">{item.name}</span>
          {multiFileAnalysisEnabled && isSelected && (
            <span className="ml-auto mr-2 text-blue-600">✓</span>
          )}
        </div>
      );
    }
  };

  const selectedIsZip = !!selectedItem && !selectedItem.isDirectory && selectedItem.name.toLowerCase().endsWith('.zip');
  const selectedIsTarGz = !!selectedItem && !selectedItem.isDirectory && selectedItem.name.toLowerCase().endsWith('.tar.gz');
  const selectedCanArchive = !!selectedItem && (selectedItem.isDirectory ? !!selectedItem.directoryHandle : !!selectedItem.fileHandle);

  const updateCopyMenuPosition = useCallback(() => {
    const trigger = copyMenuTriggerRef.current;
    const menu = copyMenuContentRef.current;

    if (!trigger || !menu) {
      return false;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const spacing = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = triggerRect.right + spacing;
    let top = triggerRect.top;

    if (left + menuRect.width > viewportWidth - spacing) {
      const fallbackLeft = triggerRect.left - spacing - menuRect.width;
      if (fallbackLeft >= spacing) {
        left = fallbackLeft;
      } else {
        left = Math.max(spacing, viewportWidth - menuRect.width - spacing);
      }
    }

    if (top + menuRect.height > viewportHeight - spacing) {
      top = Math.max(spacing, viewportHeight - menuRect.height - spacing);
    }

    setCopyMenuPosition({ top, left });
    return true;
  }, []);

  useEffect(() => {
    if (!copyMenuOpen) {
      return;
    }

    let animationFrameId = 0;

    const ensurePosition = () => {
      const positioned = updateCopyMenuPosition();
      if (!positioned) {
        animationFrameId = window.requestAnimationFrame(ensurePosition);
      }
    };

    ensurePosition();

    window.addEventListener('resize', ensurePosition);
    window.addEventListener('scroll', ensurePosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', ensurePosition);
      window.removeEventListener('scroll', ensurePosition, true);
    };
  }, [copyMenuOpen, updateCopyMenuPosition]);

  useEffect(() => {
    if (!copyMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      const clickedInsideTrigger = copyMenuContainerRef.current?.contains(targetNode);
      const clickedInsideMenu = copyMenuContentRef.current?.contains(targetNode);

      if (!clickedInsideTrigger && !clickedInsideMenu) {
        setCopyMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCopyMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [copyMenuOpen]);

  const buildTreeLines = useCallback(
    (item: FileTreeItem, options: { includeFiles: boolean }, prefix = ''): string[] => {
      const children = item.children ?? [];
      const visibleChildren = children.filter((child) => child.isDirectory || options.includeFiles);

      if (visibleChildren.length === 0) {
        return [];
      }

      const lines: string[] = [];

      visibleChildren.forEach((child, index) => {
        const isLast = index === visibleChildren.length - 1;
        const connector = isLast ? '└── ' : '├── ';

        if (child.isDirectory || options.includeFiles) {
          lines.push(`${prefix}${connector}${child.name}`);
        }

        if (child.isDirectory) {
          const nextPrefix = `${prefix}${isLast ? '    ' : '│   '}`;
          lines.push(...buildTreeLines(child, options, nextPrefix));
        }
      });

      return lines;
    },
    [],
  );

  const buildTableRows = useCallback(
    (
      item: FileTreeItem,
      options: { includeFiles: boolean },
      currentPath = '',
    ): { name: string; path: string }[] => {
      const rows: { name: string; path: string }[] = [];
      const children = item.children ?? [];

      children.forEach((child) => {
        const folderPath = currentPath ? `/${currentPath}` : '/';

        if (child.isDirectory) {
          rows.push({ name: child.name, path: folderPath });
          const nextPath = currentPath ? `${currentPath}/${child.name}` : child.name;
          rows.push(...buildTableRows(child, options, nextPath));
        } else if (options.includeFiles) {
          rows.push({ name: child.name, path: folderPath });
        }
      });

      return rows;
    },
    [],
  );

  const handleCopyStructure = useCallback(
    async (options: { includeFiles: boolean; format: 'tree' | 'table' }) => {
      if (!rootFileTree) {
        return;
      }

      try {
        setIsCopyingStructure(true);
        const rootName = rootFolderName || rootFileTree.name || '/';
        let copiedText = '';

        if (options.format === 'tree') {
          const treeLines = [rootName, ...buildTreeLines(rootFileTree, options)];
          copiedText = treeLines.join('\n');
        } else {
          const tableRows = [{ name: rootName, path: '/' }, ...buildTableRows(rootFileTree, options)];
          const header = 'Name\tFolder Path';
          copiedText = [header, ...tableRows.map((row) => `${row.name}\t${row.path}`)].join('\n');
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(copiedText);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = copiedText;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }

        alert('ディレクトリ構成をクリップボードにコピーしました');
      } catch (error) {
        console.error('Failed to copy directory structure:', error);
        alert(`ディレクトリ構成のコピーに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsCopyingStructure(false);
      }
    },
    [buildTableRows, buildTreeLines, rootFileTree, rootFolderName],
  );

  const handleCopyRequest = useCallback(async () => {
    if (!rootFileTree) {
      return;
    }

    try {
      await handleCopyStructure({
        includeFiles: copyTarget === 'directoriesAndFiles',
        format: copyFormat,
      });
    } finally {
      setCopyMenuOpen(false);
    }
  }, [copyFormat, copyTarget, handleCopyStructure, rootFileTree]);

  return (
    <div className="h-full flex flex-col bg-gray-100 dark:bg-gray-800 border-r border-gray-300 dark:border-gray-700">
      {/* ヘッダー */}
      <div className="px-3 py-2 border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
        <div className="flex items-center">
          <h2 className="font-medium text-sm">エクスプローラ</h2>
          {gitLoading && (
            <span
              className="ml-2 flex items-center text-xs text-blue-600 dark:text-blue-300"
              title="Gitリポジトリを更新しています"
            >
              <IoSyncOutline className="mr-1 animate-spin" size={14} /> 更新中
            </span>
          )}
          {multiFileAnalysisEnabled && (
            <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
              分析モード
            </span>
          )}
        </div>
        <div className="flex space-x-1">
          <div className="relative" ref={copyMenuContainerRef}>
            <button
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
              onClick={() => setCopyMenuOpen((prev) => !prev)}
              title="ディレクトリ構成をコピー"
              disabled={!rootFileTree || isCopyingStructure}
              ref={copyMenuTriggerRef}
            >
              <IoCopyOutline size={18} />
            </button>
            {copyMenuOpen &&
              createPortal(
                <div
                  ref={copyMenuContentRef}
                  className="fixed w-64 rounded-md border border-gray-300 bg-white text-xs shadow-lg dark:border-gray-600 dark:bg-gray-800 z-[9999]"
                  style={{ top: copyMenuPosition.top, left: copyMenuPosition.left }}
                >
                  <div className="border-b border-gray-200 px-3 py-2 font-medium text-gray-700 dark:border-gray-700 dark:text-gray-100">
                    コピー設定
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">コピー対象</p>
                    <label className="mt-2 flex cursor-pointer items-center space-x-2">
                      <input
                        type="radio"
                        name="copy-target"
                        value="directoriesAndFiles"
                        checked={copyTarget === 'directoriesAndFiles'}
                        onChange={() => setCopyTarget('directoriesAndFiles')}
                      />
                      <span>フォルダとファイル</span>
                    </label>
                    <label className="mt-2 flex cursor-pointer items-center space-x-2">
                      <input
                        type="radio"
                        name="copy-target"
                        value="directoriesOnly"
                        checked={copyTarget === 'directoriesOnly'}
                        onChange={() => setCopyTarget('directoriesOnly')}
                      />
                      <span>フォルダのみ</span>
                    </label>
                  </div>
                  <div className="border-t border-gray-200 px-3 py-2 dark:border-gray-700">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">フォーマット</p>
                    <label className="mt-2 flex cursor-pointer items-center space-x-2">
                      <input
                        type="radio"
                        name="copy-format"
                        value="tree"
                        checked={copyFormat === 'tree'}
                        onChange={() => setCopyFormat('tree')}
                      />
                      <span>tree 形式</span>
                    </label>
                    <label className="mt-2 flex cursor-pointer items-center space-x-2">
                      <input
                        type="radio"
                        name="copy-format"
                        value="table"
                        checked={copyFormat === 'table'}
                        onChange={() => setCopyFormat('table')}
                      />
                      <span>表形式（ファイル名・フォルダパス）</span>
                    </label>
                  </div>
                  <div className="border-t border-gray-200 px-3 py-2 dark:border-gray-700">
                    <button
                      className="w-full rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
                      onClick={handleCopyRequest}
                      disabled={isCopyingStructure}
                    >
                      {isCopyingStructure ? 'コピー中...' : 'コピーする'}
                    </button>
                  </div>
                </div>,
                document.body,
              )}
          </div>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={handleNewFileInRoot}
            title="新規ファイル作成"
          >
            <IoCreateOutline size={18} />
          </button>
          <button 
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={handleSelectFolder}
            title="フォルダを開く"
          >
            <IoFolderOutline size={18} />
          </button>
          <button 
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={() => rootDirHandle && refreshFolderContents()}
            title="更新"
            disabled={!rootDirHandle}
          >
            <IoReloadOutline size={18} />
          </button>
        </div>
      </div>
      
      {/* ファイルツリー */}
      <div
        className="flex-1 overflow-auto"
        onDragOver={(event) => handleDragOverForFileCopy(event, Boolean(rootDirHandle))}
        onDrop={(event) => {
          void handleRootDrop(event);
        }}
      >
        {rootFileTree ? (
          <div className="py-1 text-sm">
            {renderFileTree(rootFileTree)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4 text-center">
            <IoFolderOutline size={32} className="mb-2" />
            <p className="mb-4">フォルダが選択されていません</p>
            {apiSupported ? (
              <button
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                onClick={handleSelectFolder}
              >
                フォルダを開く
              </button>
            ) : (
              <div>
                <p className="text-yellow-600 mb-3">
                  このブラウザはFile System Access APIをサポートしていません
                </p>
                <p className="text-sm mb-4">
                  Chrome、Edge、またはChromiumベースのブラウザの最新版をご使用ください
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* フッター：選択されているフォルダ名 */}
      {rootFolderName && (
        <div className="px-3 py-2 border-t border-gray-300 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 truncate">
          {rootFolderName}
        </div>
      )}
      
      {/* コンテキストメニュー */}
      {showContextMenu && selectedItem && (
        <ContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          onClose={handleCloseContextMenu}
          onCreateFile={handleNewFile}
          onCreateFolder={handleNewFolder}
          onRename={handleRename}
          onDelete={handleDelete}
          onRefresh={() => refreshFolderContents()}
          isFile={!selectedItem.isDirectory}
          showExtractZip={selectedIsZip}
          showExtractTarGz={selectedIsTarGz}
          showCompressZip={selectedCanArchive}
          showCompressTarGz={selectedCanArchive}
          onExtractZip={() => handleExtractArchive('zip')}
          onExtractTarGz={() => handleExtractArchive('tar.gz')}
          onCompressZip={() => handleCompressArchive('zip')}
          onCompressTarGz={() => handleCompressArchive('tar.gz')}
          showGitHistory={Boolean(repoInitialized && selectedItem && !selectedItem.isDirectory)}
          onShowGitHistory={handleShowGitHistory}
          showRevealInFileManager={Boolean(rootDirHandle && apiSupported)}
          revealInFileManagerLabel={fileManagerLabel}
          onRevealInFileManager={handleRevealInFileManager}
        />
      )}
      
      {/* 入力ダイアログ */}
      {showInputDialog && (
        <InputDialog
          isOpen={showInputDialog}
          title={
            inputDialogMode === 'newFile'
              ? '新規ファイル作成' 
              : inputDialogMode === 'newFolder' 
                ? '新規フォルダ作成' 
                : inputDialogMode === 'tempFile'
                  ? '一時ファイル作成'
                  : '名前の変更'
          }
          label={
            inputDialogMode === 'newFile' 
              ? 'ファイル名' 
              : inputDialogMode === 'newFolder' 
                ? 'フォルダ名' 
                : inputDialogMode === 'tempFile'
                  ? 'ファイル名'
                  : '新しい名前'
          }
          showExtensionSelect={inputDialogMode === 'newFile' || inputDialogMode === 'tempFile'}
          extensions={['md', 'txt', 'json', 'csv', 'tsv', 'yaml', 'html', 'js', 'ts', 'css', 'mmd']}
          initialValue={inputDialogInitialValue}
          validateInput={validateFileName}
          onConfirm={handleInputConfirm}
          onCancel={() => setShowInputDialog(false)}
        />
      )}

      {showMermaidTemplateDialog && pendingMermaidFile && (
        <MermaidTemplateDialog
          isOpen={showMermaidTemplateDialog}
          fileName={pendingMermaidFile.fileName}
          historyKey={pendingMermaidFile.fileName}
          onCancel={handleMermaidTemplateCancel}
          onConfirm={handleMermaidTemplateConfirm}
        />
      )}

      {/* 削除確認ダイアログ */}
      {showConfirmDialog && selectedItem && (
        <ConfirmDialog
          isOpen={showConfirmDialog}
          title={`${selectedItem.isDirectory ? 'フォルダ' : 'ファイル'}を削除`}
          message={`"${selectedItem.name}" を削除してもよろしいですか？${selectedItem.isDirectory ? 'フォルダ内のすべてのファイルとフォルダも削除されます。' : ''}`}
          confirmLabel="削除"
          isDestructive={true}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowConfirmDialog(false)}
        />
      )}
    </div>
  );
};

export default FileExplorer;
