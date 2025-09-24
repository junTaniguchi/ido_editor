'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { IoCloseOutline } from 'react-icons/io5';
import { diagramDefinitions, diagramList } from '@/lib/mermaid/diagramDefinitions';
import type { MermaidDiagramType } from '@/lib/mermaid/types';

interface MermaidTemplateDialogProps {
  isOpen: boolean;
  initialType?: MermaidDiagramType;
  onCancel: () => void;
  onConfirm: (diagramType: MermaidDiagramType) => void;
}

const MermaidTemplateDialog: React.FC<MermaidTemplateDialogProps> = ({
  isOpen,
  initialType = 'flowchart',
  onCancel,
  onConfirm,
}) => {
  const [selectedType, setSelectedType] = useState<MermaidDiagramType>(initialType);

  useEffect(() => {
    if (isOpen) {
      setSelectedType(initialType);
    }
  }, [initialType, isOpen]);

  const definition = useMemo(() => diagramDefinitions[selectedType], [selectedType]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-[30rem] max-w-full">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium">Mermaid テンプレートを選択</h3>
          <button
            type="button"
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            onClick={onCancel}
            aria-label="ダイアログを閉じる"
          >
            <IoCloseOutline size={22} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              図の種類
            </label>
            <select
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm bg-white dark:bg-gray-700 dark:text-white"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value as MermaidDiagramType)}
            >
              {diagramList.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {definition.description}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">挿入されるテンプレート</p>
            <pre className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-3 text-xs overflow-x-auto whitespace-pre">
              {definition.defaultTemplate}
            </pre>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
            onClick={onCancel}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
            onClick={() => onConfirm(selectedType)}
          >
            作成
          </button>
        </div>
      </div>
    </div>
  );
};

export default MermaidTemplateDialog;
