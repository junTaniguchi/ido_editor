
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

import React, { useState, useEffect, useCallback } from 'react';
import { 
  IoFolderOutline, IoDocumentOutline, IoChevronForward, IoChevronDown,
  IoCreateOutline, IoReloadOutline
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
  compressToTarGz
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
    removeSelectedFile
  } = useEditorStore();
  const setGitRootDirectory = useGitStore((state) => state.setRootDirectory);
  // Avoid returning an object literal from the selector which creates a new
  // reference on each render and can cause infinite update loops. Select
  // individual properties instead so selectors are stable.
  const repoInitialized = useGitStore((state) => state.repoInitialized);
  const getFileHistory = useGitStore((state) => state.getFileHistory);
  
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [apiSupported, setApiSupported] = useState<boolean>(true);
  
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
      const dataFileTypes = ['csv', 'tsv', 'json', 'yaml', 'yml', 'xlsx', 'xls'];
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

        if (fileType === 'excel') {
          content = '';
        } else if (fileType === 'pdf') {
          const file = await item.fileHandle.getFile();
          content = URL.createObjectURL(file);
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

  const getParentDirectoryHandleForItem = async (item: FileTreeItem): Promise<FileSystemDirectoryHandle | null> => {
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
  };

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
  }, [addTab, getFileHistory, repoInitialized, selectedItem, setActiveTabId, tabs]);
  
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
    async (diagramType: MermaidDiagramType) => {
      if (!pendingMermaidFile) return;

      const template = getMermaidTemplate(diagramType);

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

  return (
    <div className="h-full flex flex-col bg-gray-100 dark:bg-gray-800 border-r border-gray-300 dark:border-gray-700">
      {/* ヘッダー */}
      <div className="px-3 py-2 border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
        <div className="flex items-center">
          <h2 className="font-medium text-sm">エクスプローラ</h2>
          {multiFileAnalysisEnabled && (
            <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
              分析モード
            </span>
          )}
        </div>
        <div className="flex space-x-1">
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
      <div className="flex-1 overflow-auto">
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
