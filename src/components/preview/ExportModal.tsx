'use client';

import React, { useState } from 'react';
import { IoCloseOutline, IoDownloadOutline, IoSettingsOutline } from 'react-icons/io5';
import {
  CSVExportOptions,
  TSVExportOptions, 
  JSONExportOptions,
  YAMLExportOptions,
  ParquetExportOptions,
  defaultCSVOptions,
  defaultTSVOptions,
  defaultJSONOptions,
  defaultYAMLOptions,
  defaultParquetOptions,
  exportToCSV,
  exportToTSV,
  exportToJSON,
  exportToYAML,
  exportToParquet,
  createEncodedBlob,
  downloadFile
} from '@/lib/dataFormatUtils';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[];
  fileName: string;
}

type ExportFormat = 'csv' | 'tsv' | 'json' | 'yaml' | 'parquet';

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, data, fileName }) => {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [csvOptions, setCsvOptions] = useState<CSVExportOptions>(defaultCSVOptions);
  const [tsvOptions, setTsvOptions] = useState<TSVExportOptions>(defaultTSVOptions);
  const [jsonOptions, setJsonOptions] = useState<JSONExportOptions>(defaultJSONOptions);
  const [yamlOptions, setYamlOptions] = useState<YAMLExportOptions>(defaultYAMLOptions);
  const [parquetOptions, setParquetOptions] = useState<ParquetExportOptions>(defaultParquetOptions);

  if (!isOpen) return null;

  const handleExport = () => {
    if (!data || data.length === 0) return;

    let content: string = '';
    let mimeType: string = '';
    let extension: string = '';
    let encoding: 'utf-8' | 'shift-jis' = 'utf-8';

    const baseFileName = fileName.replace(/\.[^/.]+$/, '');

    switch (format) {
      case 'csv':
        content = exportToCSV(data, csvOptions);
        mimeType = 'text/csv';
        extension = 'csv';
        encoding = csvOptions.encoding;
        break;
      case 'tsv':
        content = exportToTSV(data, tsvOptions);
        mimeType = 'text/tab-separated-values';
        extension = 'tsv';
        encoding = tsvOptions.encoding;
        break;
      case 'json':
        content = exportToJSON(data, jsonOptions);
        mimeType = 'application/json';
        extension = 'json';
        encoding = jsonOptions.encoding;
        break;
      case 'yaml':
        content = exportToYAML(data, yamlOptions);
        mimeType = 'text/yaml';
        extension = 'yaml';
        encoding = yamlOptions.encoding;
        break;
      case 'parquet':
        content = exportToParquet(data, parquetOptions);
        mimeType = 'application/octet-stream';
        extension = 'parquet';
        encoding = parquetOptions.encoding;
        break;
    }

    const blob = createEncodedBlob(content, encoding, mimeType);
    downloadFile(blob, `${baseFileName}.${extension}`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <IoDownloadOutline size={24} className="mr-2 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">データエクスポート</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <IoCloseOutline size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* フォーマット選択 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              エクスポート形式
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(['csv', 'tsv', 'json', 'yaml', 'parquet'] as ExportFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  className={`p-3 rounded border text-center ${
                    format === fmt
                      ? 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900 dark:border-blue-400 dark:text-blue-300'
                      : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* CSV設定 */}
          {format === 'csv' && (
            <div className="space-y-4">
              <h3 className="text-md font-medium text-gray-900 dark:text-gray-100 flex items-center">
                <IoSettingsOutline className="mr-2" />
                CSV設定
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    区切り文字
                  </label>
                  <select
                    value={csvOptions.delimiter}
                    onChange={(e) => setCsvOptions({...csvOptions, delimiter: e.target.value as any})}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value=",">カンマ (,)</option>
                    <option value=";">セミコロン (;)</option>
                    <option value="|">パイプ (|)</option>
                    <option value="\t">タブ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    クォート文字
                  </label>
                  <select
                    value={csvOptions.quote}
                    onChange={(e) => setCsvOptions({...csvOptions, quote: e.target.value as any})}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value='"'>ダブルクォート (")</option>
                    <option value="'">シングルクォート (')</option>
                    <option value="">なし</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    クォートルール
                  </label>
                  <select
                    value={csvOptions.quoteRule}
                    onChange={(e) => setCsvOptions({...csvOptions, quoteRule: e.target.value as any})}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="minimal">最小限</option>
                    <option value="all">すべて</option>
                    <option value="nonnumeric">非数値</option>
                    <option value="none">なし</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    NULL値の表現
                  </label>
                  <select
                    value={csvOptions.nullValue}
                    onChange={(e) => setCsvOptions({...csvOptions, nullValue: e.target.value as any})}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">空文字</option>
                    <option value="NULL">NULL</option>
                    <option value="null">null</option>
                    <option value="\\N">\\N</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    エンコーディング
                  </label>
                  <select
                    value={csvOptions.encoding}
                    onChange={(e) => setCsvOptions({...csvOptions, encoding: e.target.value as any})}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="utf-8">UTF-8</option>
                    <option value="shift-jis">Shift-JIS</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    改行コード
                  </label>
                  <select
                    value={csvOptions.lineBreak}
                    onChange={(e) => setCsvOptions({...csvOptions, lineBreak: e.target.value as any})}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="\n">LF (Unix/Mac)</option>
                    <option value="\r\n">CRLF (Windows)</option>
                    <option value="\r">CR (Classic Mac)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="csv-headers"
                  checked={csvOptions.includeHeaders}
                  onChange={(e) => setCsvOptions({...csvOptions, includeHeaders: e.target.checked})}
                  className="mr-2"
                />
                <label htmlFor="csv-headers" className="text-sm text-gray-700 dark:text-gray-300">
                  ヘッダー行を含める
                </label>
              </div>
            </div>
          )}

          {/* TSV設定 */}
          {format === 'tsv' && (
            <div className="space-y-4">
              <h3 className="text-md font-medium text-gray-900 dark:text-gray-100 flex items-center">
                <IoSettingsOutline className="mr-2" />
                TSV設定
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    NULL値の表現
                  </label>
                  <select
                    value={tsvOptions.nullValue}
                    onChange={(e) => setTsvOptions({...tsvOptions, nullValue: e.target.value as any})}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">空文字</option>
                    <option value="NULL">NULL</option>
                    <option value="null">null</option>
                    <option value="\\N">\\N</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    エンコーディング
                  </label>
                  <select
                    value={tsvOptions.encoding}
                    onChange={(e) => setTsvOptions({...tsvOptions, encoding: e.target.value as any})}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="utf-8">UTF-8</option>
                    <option value="shift-jis">Shift-JIS</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    改行コード
                  </label>
                  <select
                    value={tsvOptions.lineBreak}
                    onChange={(e) => setTsvOptions({...tsvOptions, lineBreak: e.target.value as any})}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="\n">LF (Unix/Mac)</option>
                    <option value="\r\n">CRLF (Windows)</option>
                    <option value="\r">CR (Classic Mac)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="tsv-headers"
                  checked={tsvOptions.includeHeaders}
                  onChange={(e) => setTsvOptions({...tsvOptions, includeHeaders: e.target.checked})}
                  className="mr-2"
                />
                <label htmlFor="tsv-headers" className="text-sm text-gray-700 dark:text-gray-300">
                  ヘッダー行を含める
                </label>
              </div>
            </div>
          )}

          {/* JSON設定 */}
          {format === 'json' && (
            <div className="space-y-4">
              <h3 className="text-md font-medium text-gray-900 dark:text-gray-100 flex items-center">
                <IoSettingsOutline className="mr-2" />
                JSON設定
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    インデント
                  </label>
                  <select
                    value={jsonOptions.indent}
                    onChange={(e) => setJsonOptions({...jsonOptions, indent: Number(e.target.value) as any})}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value={0}>なし（圧縮）</option>
                    <option value={2}>2スペース</option>
                    <option value={4}>4スペース</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    エンコーディング
                  </label>
                  <select
                    value={jsonOptions.encoding}
                    onChange={(e) => setJsonOptions({...jsonOptions, encoding: e.target.value as any})}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="utf-8">UTF-8</option>
                    <option value="shift-jis">Shift-JIS</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="json-array"
                  checked={jsonOptions.arrayFormat}
                  onChange={(e) => setJsonOptions({...jsonOptions, arrayFormat: e.target.checked})}
                  className="mr-2"
                />
                <label htmlFor="json-array" className="text-sm text-gray-700 dark:text-gray-300">
                  配列形式で出力
                </label>
              </div>
            </div>
          )}

          {/* YAML設定 */}
          {format === 'yaml' && (
            <div className="space-y-4">
              <h3 className="text-md font-medium text-gray-900 dark:text-gray-100 flex items-center">
                <IoSettingsOutline className="mr-2" />
                YAML設定
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    インデント
                  </label>
                  <select
                    value={yamlOptions.indent}
                    onChange={(e) => setYamlOptions({...yamlOptions, indent: Number(e.target.value) as any})}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value={2}>2スペース</option>
                    <option value={4}>4スペース</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    エンコーディング
                  </label>
                  <select
                    value={yamlOptions.encoding}
                    onChange={(e) => setYamlOptions({...yamlOptions, encoding: e.target.value as any})}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="utf-8">UTF-8</option>
                    <option value="shift-jis">Shift-JIS</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="yaml-array"
                  checked={yamlOptions.arrayFormat}
                  onChange={(e) => setYamlOptions({...yamlOptions, arrayFormat: e.target.checked})}
                  className="mr-2"
                />
                <label htmlFor="yaml-array" className="text-sm text-gray-700 dark:text-gray-300">
                  配列形式で出力
                </label>
              </div>
            </div>
          )}

          {/* Parquet設定 */}
          {format === 'parquet' && (
            <div className="space-y-4">
              <h3 className="text-md font-medium text-gray-900 dark:text-gray-100 flex items-center">
                <IoSettingsOutline className="mr-2" />
                Parquet設定
              </h3>
              
              <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded p-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  注意: 現在のParquetエクスポートは簡易版です。実際のバイナリParquet形式ではなく、CSV形式で出力されます。
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  圧縮レベル
                </label>
                <select
                  value={parquetOptions.compression}
                  onChange={(e) => setParquetOptions({...parquetOptions, compression: e.target.value as any})}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="none">なし</option>
                  <option value="snappy">Snappy</option>
                  <option value="gzip">GZIP</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            キャンセル
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
          >
            <IoDownloadOutline className="mr-2" size={16} />
            エクスポート
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;