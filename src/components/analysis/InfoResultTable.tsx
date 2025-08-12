import React from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  ColumnDef,
} from '@tanstack/react-table';

interface InfoResultTableProps {
  infoResult: Record<string, any>;
}

const InfoResultTable: React.FC<InfoResultTableProps> = ({ infoResult }) => {
  if (!infoResult || Object.keys(infoResult).length === 0) {
    return <div className="text-center p-4 text-gray-500">型・最大文字数サマリーがありません</div>;
  }

  // 縦持ち（項目が行、指標が列）
  const columns: ColumnDef<any>[] = [
    { accessorKey: 'col', header: '項目' },
    { accessorKey: 'type', header: '型' },
    { accessorKey: 'nonNullCount', header: '非null件数' },
    { accessorKey: 'maxLength', header: '最大文字数' },
    { accessorKey: 'sample', header: 'サンプル値' },
  ];

  const rows = Object.entries(infoResult).map(([col, info]) => ({
    col,
    type: info.type,
    nonNullCount: info.nonNullCount,
    maxLength: info.maxLength ?? '-',
    sample: Array.isArray(info.sample) ? info.sample.map(String).join(', ') : '-',
  }));

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700 rounded-lg shadow">
        <thead className="bg-gray-100 dark:bg-gray-800">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  key={header.id}
                  className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="bg-white dark:bg-gray-900">
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
              {row.getVisibleCells().map(cell => (
                <td
                  key={cell.id}
                  className="px-4 py-2 text-sm text-gray-900 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default InfoResultTable;
