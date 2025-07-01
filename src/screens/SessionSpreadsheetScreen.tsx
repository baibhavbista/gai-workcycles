import React, { useState, useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Home, Download } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import type { CycleData, EnergyLevel, MoraleLevel, CycleStatus } from '../types';

interface SpreadsheetRow {
  id: string;
  label: string;
  category: 'plan' | 'review' | 'header';
  isEditable: boolean;
  [key: string]: any; // For cycle data
}

const columnHelper = createColumnHelper<SpreadsheetRow>();

export function SessionSpreadsheetScreen() {
  const { currentSession, setScreen } = useWorkCyclesStore();
  
  const [data, setData] = useState<SpreadsheetRow[]>(() => {
    if (!currentSession) return [];
    
    const cycles = currentSession.cycles;
    // Only use completed cycles, not planned cycles
    const completedCycles = cycles.length;
    
    // Create rows for each field
    const rows: SpreadsheetRow[] = [
      // PLAN section
      {
        id: 'plan_header',
        label: 'PLAN',
        category: 'plan',
        isEditable: false,
      },
      {
        id: 'goal',
        label: 'What am I trying to accomplish this cycle?',
        category: 'plan',
        isEditable: true,
        ...cycles.reduce((acc, cycle, index) => {
          acc[`cycle_${index + 1}`] = cycle.goal || '';
          return acc;
        }, {} as Record<string, any>)
      },
      {
        id: 'firstStep',
        label: 'How will I get started?',
        category: 'plan',
        isEditable: true,
        ...cycles.reduce((acc, cycle, index) => {
          acc[`cycle_${index + 1}`] = cycle.firstStep || '';
          return acc;
        }, {} as Record<string, any>)
      },
      {
        id: 'hazards',
        label: 'Any hazards present?',
        category: 'plan',
        isEditable: true,
        ...cycles.reduce((acc, cycle, index) => {
          acc[`cycle_${index + 1}`] = cycle.hazards || '';
          return acc;
        }, {} as Record<string, any>)
      },
      {
        id: 'energy',
        label: '⚡ Energy',
        category: 'plan',
        isEditable: true,
        ...cycles.reduce((acc, cycle, index) => {
          acc[`cycle_${index + 1}`] = cycle.energy || 'Medium';
          return acc;
        }, {} as Record<string, any>)
      },
      {
        id: 'morale',
        label: '💙 Morale',
        category: 'plan',
        isEditable: true,
        ...cycles.reduce((acc, cycle, index) => {
          acc[`cycle_${index + 1}`] = cycle.morale || 'Medium';
          return acc;
        }, {} as Record<string, any>)
      },
      // REVIEW section
      {
        id: 'review_header',
        label: 'REVIEW',
        category: 'review',
        isEditable: false,
      },
      {
        id: 'status',
        label: '✅ Completed cycle\'s target?',
        category: 'review',
        isEditable: true,
        ...cycles.reduce((acc, cycle, index) => {
          acc[`cycle_${index + 1}`] = cycle.status || 'miss';
          return acc;
        }, {} as Record<string, any>)
      },
      {
        id: 'noteworthy',
        label: 'Anything noteworthy?',
        category: 'review',
        isEditable: true,
        ...cycles.reduce((acc, cycle, index) => {
          acc[`cycle_${index + 1}`] = cycle.noteworthy || '';
          return acc;
        }, {} as Record<string, any>)
      },
      {
        id: 'distractions',
        label: 'Any distractions?',
        category: 'review',
        isEditable: true,
        ...cycles.reduce((acc, cycle, index) => {
          acc[`cycle_${index + 1}`] = cycle.distractions || '';
          return acc;
        }, {} as Record<string, any>)
      },
      {
        id: 'improvement',
        label: 'Things to improve for next cycle?',
        category: 'review',
        isEditable: true,
        ...cycles.reduce((acc, cycle, index) => {
          acc[`cycle_${index + 1}`] = cycle.improvement || '';
          return acc;
        }, {} as Record<string, any>)
      },
    ];
    
    return rows;
  });

  const updateData = (rowIndex: number, columnId: string, value: any) => {
    setData(old =>
      old.map((row, index) => {
        if (index === rowIndex) {
          return {
            ...row,
            [columnId]: value,
          };
        }
        return row;
      })
    );
  };

  const moveToNextCell = (currentRowIndex: number, currentColumnId: string) => {
    // Find the next editable cell below the current one
    const editableRows = data.filter(row => row.isEditable);
    const currentEditableRowIndex = editableRows.findIndex(row => 
      data.findIndex(d => d.id === row.id) === currentRowIndex
    );
    
    if (currentEditableRowIndex < editableRows.length - 1) {
      const nextRow = editableRows[currentEditableRowIndex + 1];
      const nextRowIndex = data.findIndex(d => d.id === nextRow.id);
      
      // Focus the next cell
      setTimeout(() => {
        const nextCell = document.querySelector(
          `[data-row-index="${nextRowIndex}"][data-column-id="${currentColumnId}"]`
        ) as HTMLElement;
        if (nextCell) {
          nextCell.click();
        }
      }, 50);
    }
  };

  const EditableCell = ({ getValue, row, column, table }: any) => {
    const initialValue = getValue();
    const [value, setValue] = useState(initialValue);
    const [isEditing, setIsEditing] = useState(false);

    const rowData = row.original as SpreadsheetRow;
    
    // Check if this cell should be non-editable
    const isNonEditable = column.id === 'label' || !rowData.isEditable;

    const onBlur = () => {
      setIsEditing(false);
      table.options.meta?.updateData(row.index, column.id, value);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          // Shift+Enter: Insert line break (only for textarea)
          if (e.target instanceof HTMLTextAreaElement) {
            const textarea = e.target;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newValue = value.substring(0, start) + '\n' + value.substring(end);
            setValue(newValue);
            
            // Set cursor position after the new line
            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd = start + 1;
            }, 0);
          }
        } else {
          // Regular Enter: Save and move to next cell
          e.preventDefault();
          onBlur();
          table.options.meta?.moveToNextCell(row.index, column.id);
        }
      } else if (e.key === 'Escape') {
        setValue(initialValue);
        setIsEditing(false);
      }
    };

    React.useEffect(() => {
      setValue(initialValue);
    }, [initialValue]);

    if (isNonEditable) {
      if (column.id === 'label') {
        // Row labels
        if (rowData.category === 'plan' && rowData.id === 'plan_header') {
          return (
            <div className="p-3 bg-purple-100 font-bold text-purple-800 text-center">
              PLAN
            </div>
          );
        } else if (rowData.category === 'review' && rowData.id === 'review_header') {
          return (
            <div className="p-3 bg-purple-100 font-bold text-purple-800 text-center">
              REVIEW
            </div>
          );
        } else {
          return (
            <div className="p-3 bg-gray-100 font-medium text-gray-800 text-sm">
              {value}
            </div>
          );
        }
      } else {
        // Non-editable data cells (PLAN and REVIEW headers)
        return (
          <div className="p-3 bg-purple-100">
            {/* Empty cell for header rows */}
          </div>
        );
      }
    }

    if (isEditing) {
      if (rowData.id === 'energy' || rowData.id === 'morale') {
        return (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            autoFocus
            className="w-full p-2 border border-blue-500 rounded focus:outline-none text-sm"
            data-row-index={row.index}
            data-column-id={column.id}
          >
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        );
      } else if (rowData.id === 'status') {
        return (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            autoFocus
            className="w-full p-2 border border-blue-500 rounded focus:outline-none text-sm"
            data-row-index={row.index}
            data-column-id={column.id}
          >
            <option value="hit">Yes</option>
            <option value="partial">Half</option>
            <option value="miss">No</option>
          </select>
        );
      } else {
        return (
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            autoFocus
            className="w-full p-2 border border-blue-500 rounded focus:outline-none resize-none text-sm"
            rows={3}
            data-row-index={row.index}
            data-column-id={column.id}
          />
        );
      }
    }

    return (
      <div
        onClick={() => setIsEditing(true)}
        className="cursor-text p-2 min-h-[3rem] hover:bg-gray-50 rounded text-sm"
        data-row-index={row.index}
        data-column-id={column.id}
      >
        {rowData.id === 'status' ? (
          <span className={`px-2 py-1 rounded text-xs ${
            value === 'hit' ? 'bg-green-100 text-green-700' :
            value === 'partial' ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700'
          }`}>
            {value === 'hit' ? 'Yes' : value === 'partial' ? 'Half' : 'No'}
          </span>
        ) : (
          <span className="whitespace-pre-wrap">{value || ''}</span>
        )}
      </div>
    );
  };

  const cycles = currentSession?.cycles || [];
  // Only show columns for completed cycles
  const completedCycles = cycles.length;

  const columns = useMemo(() => {
    const cols = [
      columnHelper.accessor('label', {
        header: () => (
          <div className="bg-gray-100 p-3 text-center font-bold text-gray-800 min-w-[250px]">
            Field
          </div>
        ),
        cell: EditableCell,
        size: 250,
      }),
    ];

    // Add columns only for completed cycles
    for (let i = 1; i <= completedCycles; i++) {
      const cycle = cycles[i - 1];
      const cycleStartTime = cycle?.startedAt ? new Date(cycle.startedAt) : null;
      const timeString = cycleStartTime ? 
        cycleStartTime.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        }) : '';

      cols.push(
        columnHelper.accessor(`cycle_${i}` as any, {
          header: () => (
            <div className="bg-gray-100 p-3 text-center font-bold text-gray-800 min-w-[200px]">
              <div>Cycle {i}</div>
              {timeString && (
                <div className="text-xs font-normal text-gray-600 mt-1">
                  {timeString}
                </div>
              )}
            </div>
          ),
          cell: EditableCell,
          size: 200,
        })
      );
    }

    return cols;
  }, [completedCycles, cycles]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      updateData,
      moveToNextCell,
    },
  });

  const handleExport = () => {
    if (!currentSession) return;
    
    // Create CSV content with only completed cycles
    const headers = ['Field', ...Array.from({length: completedCycles}, (_, i) => `Cycle ${i + 1}`)];
    const csvContent = [
      headers.join(','),
      ...data.filter(row => row.id !== 'plan_header' && row.id !== 'review_header').map(row => [
        `"${row.label.replace(/"/g, '""')}"`,
        ...Array.from({length: completedCycles}, (_, i) => {
          const value = row[`cycle_${i + 1}`] || '';
          return `"${String(value).replace(/"/g, '""')}"`;
        })
      ].join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workcycles-session-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!currentSession) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">No Session Data</h1>
          <button
            onClick={() => setScreen('home')}
            className="px-6 py-3 bg-[#482F60] text-white rounded-xl font-medium hover:bg-[#3d2651] transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setScreen('session-overview')}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Home className="w-4 h-4" />
              Back to Overview
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Session Spreadsheet</h1>
              <p className="text-sm text-gray-600">
                {new Intl.DateTimeFormat('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                }).format(new Date(currentSession.startedAt))} • {completedCycles} completed cycles
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Session Intentions Summary */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl">
          <h2 className="font-semibold text-gray-900 mb-2">Session Objective</h2>
          <p className="text-sm text-gray-700 mb-3">{currentSession.intentions.objective}</p>
          
          {currentSession.intentions.definitionOfDone && (
            <>
              <h3 className="font-medium text-gray-900 mb-1">Definition of Done</h3>
              <p className="text-sm text-gray-700">{currentSession.intentions.definitionOfDone}</p>
            </>
          )}
        </div>
      </div>

      {/* Show message if no cycles completed */}
      {completedCycles === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Completed Cycles</h2>
            <p className="text-gray-600 mb-6">
              Complete at least one work cycle to see data in the spreadsheet view.
            </p>
            <button
              onClick={() => setScreen('session-overview')}
              className="px-6 py-3 bg-[#482F60] text-white rounded-xl font-medium hover:bg-[#3d2651] transition-colors"
            >
              Back to Overview
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id} className="border-b border-gray-300">
                    {headerGroup.headers.map(header => (
                      <th
                        key={header.id}
                        className="border-r border-gray-300 text-left align-top"
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="border-b border-gray-200 hover:bg-gray-25">
                    {row.getVisibleCells().map(cell => (
                      <td
                        key={cell.id}
                        className="border-r border-gray-300 align-top"
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Instructions */}
          <div className="px-6 py-4 bg-blue-50 border-t border-blue-200">
            <div className="flex items-start gap-3">
              <div className="text-blue-600 mt-1">💡</div>
              <div>
                <h3 className="font-medium text-blue-900 mb-1">How to use this spreadsheet</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Click on any cell to edit its content</li>
                  <li>• <strong>Enter</strong> to save changes and move to the cell below</li>
                  <li>• <strong>Shift+Enter</strong> to add a line break within the cell</li>
                  <li>• <strong>Escape</strong> to cancel editing</li>
                  <li>• Use dropdowns for Energy, Morale, and Target completion</li>
                  <li>• Export to CSV to save or share your session data</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}