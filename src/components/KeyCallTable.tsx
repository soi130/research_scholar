'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { getForecastIndicatorOptions } from '@/lib/forecast-indicators';

type KeyCallRow = {
  id: number;
  paper_id: number | null;
  paper_name: string | null;
  filepath: string | null;
  effective_date: string | null;
  publish_date: string | null;
  paper_published_date: string | null;
  indicator: string;
  indicator_code: string | null;
  house: string;
  value: string;
  unit: string;
  forecast_period: string;
  source_text: string;
  source_type: string;
  is_deleted: number;
  created_at: string | null;
  updated_at: string | null;
};

type EditorState = {
  manualId: number | null;
  sourceType: 'manual_input' | 'extracted' | 'new';
  paper_id: number | null;
  paper_name: string;
  publish_date: string;
  indicator: string;
  house: string;
  value: string;
  unit: string;
  forecast_period: string;
  source_text: string;
};

function parseYearFromText(value: string) {
  const match = value.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function normalizePeriodLabel(value: string) {
  const text = String(value || '').trim();
  if (!text) return '';

  const fyMatch = text.match(/\bFY[\s-]?(20\d{2}|\d{2})\b/i);
  if (fyMatch) {
    const year = fyMatch[1].length === 2 ? Number(`20${fyMatch[1]}`) : Number(fyMatch[1]);
    return `FY${String(year).slice(-2)}`;
  }

  const quarterMatchA = text.match(/\b([1-4])Q[\s-]?(20\d{2}|\d{2})\b/i);
  if (quarterMatchA) {
    const year = quarterMatchA[2].length === 2 ? Number(`20${quarterMatchA[2]}`) : Number(quarterMatchA[2]);
    return `${quarterMatchA[1]}Q${String(year).slice(-2)}`;
  }

  const quarterMatchB = text.match(/\bQ([1-4])[\s-]?(20\d{2}|\d{2})\b/i);
  if (quarterMatchB) {
    const year = quarterMatchB[2].length === 2 ? Number(`20${quarterMatchB[2]}`) : Number(quarterMatchB[2]);
    return `${quarterMatchB[1]}Q${String(year).slice(-2)}`;
  }

  const plainYear = text.match(/^(20\d{2})$/);
  if (plainYear) return `FY${String(plainYear[1]).slice(-2)}`;

  return '';
}

function buildPeriodColumns(baseYear: number) {
  return [
    `FY${String(baseYear - 1).slice(-2)}`,
    `1Q${String(baseYear).slice(-2)}`,
    `2Q${String(baseYear).slice(-2)}`,
    `3Q${String(baseYear).slice(-2)}`,
    `FY${String(baseYear).slice(-2)}`,
    `1Q${String(baseYear + 1).slice(-2)}`,
    `2Q${String(baseYear + 1).slice(-2)}`,
    `3Q${String(baseYear + 1).slice(-2)}`,
    `FY${String(baseYear + 1).slice(-2)}`,
  ];
}

function emptyEditorState(): EditorState {
  return {
    manualId: null,
    sourceType: 'new',
    paper_id: null,
    paper_name: '',
    publish_date: '',
    indicator: '',
    house: '',
    value: '',
    unit: '',
    forecast_period: '',
    source_text: '',
  };
}

const INDICATOR_OPTIONS = getForecastIndicatorOptions().map((item) => item.label);

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatShortFiscalYear(year: number) {
  return `FY${String(year).slice(-2)}`;
}

export default function KeyCallTable({ onOpenViewer }: { onOpenViewer?: (id: number, cacheKey?: string) => void }) {
  const [rows, setRows] = useState<KeyCallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [message, setMessage] = useState('');

  const refreshRows = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/key-call-table?status=approved');
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshRows();
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    rows.forEach((row) => {
      const periodYear = parseYearFromText(row.forecast_period);
      const publishYear = parseYearFromText(row.publish_date || row.effective_date || '');
      if (periodYear) years.add(periodYear);
      if (publishYear) years.add(publishYear);
    });
    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => a - b);
  }, [rows]);

  const [baseYear, setBaseYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    if (!availableYears.includes(baseYear)) {
      const fallback = availableYears[availableYears.length - 1];
      if (fallback) setBaseYear(fallback);
    }
  }, [availableYears, baseYear]);

  const periodColumns = useMemo(() => buildPeriodColumns(baseYear), [baseYear]);

  const mappedRows = useMemo(() => {
    const rowMap = new Map<string, {
      indicator: string;
      house: string;
      cells: Record<string, KeyCallRow>;
    }>();

    for (const row of rows) {
      const periodLabel = normalizePeriodLabel(row.forecast_period);
      if (!periodLabel || !periodColumns.includes(periodLabel)) continue;

      const key = `${row.indicator}__${row.house}`;
      if (!rowMap.has(key)) {
        rowMap.set(key, {
          indicator: row.indicator,
          house: row.house,
          cells: {},
        });
      }
      rowMap.get(key)!.cells[periodLabel] = row;
    }

    return Array.from(rowMap.values()).sort((left, right) => {
      const indicatorSort = left.indicator.localeCompare(right.indicator);
      if (indicatorSort !== 0) return indicatorSort;
      return left.house.localeCompare(right.house);
    });
  }, [rows, periodColumns]);

  const groupedMappedRows = useMemo(() => {
    const groups = new Map<string, {
      indicator: string;
      rows: typeof mappedRows;
    }>();

    for (const row of mappedRows) {
      if (!groups.has(row.indicator)) {
        groups.set(row.indicator, {
          indicator: row.indicator,
          rows: [],
        });
      }
      groups.get(row.indicator)!.rows.push(row);
    }

    return Array.from(groups.values());
  }, [mappedRows]);

  const unmappedRows = useMemo(
    () => rows.filter((row) => !normalizePeriodLabel(row.forecast_period)),
    [rows]
  );

  const houseOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.house).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const indicatorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [...INDICATOR_OPTIONS, ...rows.map((row) => row.indicator).filter(Boolean)]
            .map((value) => value.trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const openEditorForCell = (row: KeyCallRow | null, defaults?: Partial<EditorState>) => {
    if (!editMode) return;

    if (row) {
      setEditor({
        manualId: row.source_type === 'manual_input' ? row.id : null,
        sourceType: row.source_type === 'manual_input' ? 'manual_input' : 'extracted',
        paper_id: row.paper_id,
        paper_name: row.paper_name || '',
        publish_date: row.publish_date || row.effective_date || '',
        indicator: row.indicator,
        house: row.house,
        value: row.value,
        unit: row.unit || '',
        forecast_period: row.forecast_period || '',
        source_text: row.source_text || '',
      });
      return;
    }

    setEditor({
      ...emptyEditorState(),
      ...defaults,
    });
  };

  const handleCellClick = (row: KeyCallRow | null, defaults?: Partial<EditorState>) => {
    if (editMode) {
      openEditorForCell(row, defaults);
      return;
    }

    if (row?.paper_id) {
      onOpenViewer?.(row.paper_id, row.paper_published_date || row.updated_at || undefined);
    }
  };

  const handleSave = async () => {
    if (!editor) return;
    setSaving(true);
    setMessage('');

    try {
      const payload = {
        paper_id: editor.paper_id,
        paper_name: editor.paper_name,
        publish_date: editor.publish_date,
        indicator: editor.indicator,
        house: editor.house,
        value: editor.value,
        unit: editor.unit,
        forecast_period: editor.forecast_period,
        source_text: editor.source_text,
      };

      const url = editor.manualId ? `/api/manual-key-calls/${editor.manualId}` : '/api/manual-key-calls';
      const method = editor.manualId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data?.error || 'Unable to save key call.');
        return;
      }

      setEditor(null);
      setMessage('Key call saved.');
      await refreshRows();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editor) return;
    setSaving(true);
    setMessage('');

    try {
      if (editor.manualId) {
        const res = await fetch(`/api/manual-key-calls/${editor.manualId}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data?.error || 'Unable to delete key call.');
          return;
        }
      } else {
        const res = await fetch('/api/manual-key-calls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paper_id: editor.paper_id,
            paper_name: editor.paper_name,
            publish_date: editor.publish_date,
            indicator: editor.indicator,
            house: editor.house,
            value: '',
            unit: editor.unit,
            forecast_period: editor.forecast_period,
            source_text: editor.source_text || 'Manual row deletion',
            is_deleted: 1,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data?.error || 'Unable to delete key call.');
          return;
        }
      }

      setEditor(null);
      setMessage('Key call deleted.');
      await refreshRows();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-violet-500 w-10 h-10" /></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-600">Forecast Horizon</p>
          <div className="flex items-center gap-3">
            <select
              value={baseYear}
              onChange={(event) => setBaseYear(Number(event.target.value))}
              className="rounded-2xl border border-[color:var(--border)] bg-[var(--surface-strong)] px-4 py-2 text-sm font-bold text-slate-900 outline-none"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <p className="text-sm text-slate-500">
              Showing periods from <span className="font-black text-slate-800">{formatShortFiscalYear(baseYear - 1)}</span> through <span className="font-black text-slate-800">{formatShortFiscalYear(baseYear + 1)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setEditMode((current) => !current);
              setEditor(null);
            }}
            className={`px-4 py-2.5 rounded-2xl text-sm font-black uppercase tracking-[0.16em] transition-all flex items-center gap-2 ${
              editMode
                ? 'bg-slate-900 text-white'
                : 'bg-violet-600 text-white hover:bg-violet-700'
            }`}
          >
            <Edit3 size={16} />
            {editMode ? 'Done Editing' : 'Edit Table'}
          </button>
          {editMode ? (
            <button
              onClick={() => openEditorForCell(null, { forecast_period: formatShortFiscalYear(baseYear), publish_date: getTodayIsoDate() })}
              className="px-4 py-2.5 rounded-2xl bg-emerald-600 text-white text-sm font-black uppercase tracking-[0.16em] hover:bg-emerald-700 transition-all flex items-center gap-2"
            >
              <Plus size={16} />
              Add Row
            </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
          {message}
        </div>
      ) : null}

      {unmappedRows.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {unmappedRows.length} effective key-call row{unmappedRows.length === 1 ? '' : 's'} do not have a mapped quarter/FY period yet, so they are not shown in the pivot. Edit them to add a `forecast_period`.
        </div>
      ) : null}

      <div className={`grid gap-6 ${editMode ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
        <div className="overflow-hidden rounded-[2rem] border border-[color:var(--border)] bg-[var(--surface-strong)] shadow-xl shadow-slate-200/30">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-soft)]">
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--surface-soft)] px-4 py-3 text-left text-sm font-black uppercase tracking-[0.14em] text-violet-700">Indicator</th>
                  <th className="sticky left-[180px] z-10 bg-[var(--surface-soft)] px-4 py-3 text-left text-sm font-black uppercase tracking-[0.14em] text-violet-700">House</th>
                  {periodColumns.map((period) => (
                    <th key={period} className="px-4 py-3 text-left text-sm font-black uppercase tracking-[0.14em] text-violet-700 whitespace-nowrap">{period}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappedRows.length === 0 ? (
                  <tr>
                    <td colSpan={periodColumns.length + 2} className="px-4 py-10 text-center text-slate-400">
                      No mapped key-call periods available yet.
                    </td>
                  </tr>
                ) : groupedMappedRows.map((indicatorGroup, groupIndex) => {
                  const groupTone =
                    groupIndex % 2 === 0
                      ? {
                          row: 'bg-violet-50/55 dark:bg-violet-950/28',
                          sticky: 'bg-violet-100/90 dark:bg-violet-900/55',
                          border: 'border-violet-200 dark:border-violet-800',
                        }
                      : {
                          row: 'bg-[var(--surface-soft)]',
                          sticky: 'bg-[var(--surface-strong)]',
                          border: 'border-[color:var(--border)]',
                        };

                  return indicatorGroup.rows.map((rowGroup, rowIndex) => (
                    <tr
                      key={`${rowGroup.indicator}-${rowGroup.house}`}
                      className={`border-t-2 ${groupTone.border} ${groupTone.row}`}
                    >
                      {rowIndex === 0 ? (
                        <td
                          rowSpan={indicatorGroup.rows.length}
                          className={`sticky left-0 z-10 px-4 py-4 align-top font-black min-w-[180px] text-slate-950 dark:text-white ${groupTone.sticky}`}
                        >
                          {rowGroup.indicator}
                        </td>
                      ) : null}
                      <td
                        className={`sticky left-[180px] z-10 px-4 py-4 font-semibold min-w-[220px] text-slate-950 dark:text-white ${groupTone.sticky}`}
                      >
                        {rowGroup.house}
                      </td>
                      {periodColumns.map((period) => {
                        const cell = rowGroup.cells[period];
                        const tooltip = cell
                          ? [
                              `Value: ${cell.value}${cell.unit ? ` ${cell.unit}` : ''}`,
                              `Date: ${cell.publish_date || cell.effective_date || 'Unknown'}`,
                              `Source: ${cell.source_type === 'manual_input' ? 'Manual input' : 'Extracted from paper'}`,
                              `House: ${cell.house}`,
                              cell.paper_name ? `Paper: ${cell.paper_name}` : null,
                            ].filter(Boolean).join('\n')
                          : editMode
                            ? `Add manual value for ${rowGroup.indicator} / ${rowGroup.house} / ${period}`
                            : '';

                        return (
                          <td
                            key={`${rowGroup.indicator}-${rowGroup.house}-${period}`}
                            className={`px-3 py-3 align-top min-w-[140px] ${groupTone.row}`}
                          >
                            <button
                              type="button"
                              title={tooltip}
                              onClick={() => handleCellClick(cell || null, {
                                indicator: rowGroup.indicator,
                                house: rowGroup.house,
                                forecast_period: period,
                              })}
                              className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${
                                cell
                                  ? cell.source_type === 'manual_input'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-100'
                                    : 'border-slate-200 bg-white/90 text-slate-950 dark:border-slate-600 dark:bg-slate-900/70 dark:text-white'
                                  : editMode
                                    ? 'border-dashed border-violet-300 bg-violet-50 text-violet-600 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/35 dark:text-violet-200 dark:hover:bg-violet-900/45'
                                    : 'border-transparent bg-transparent text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {cell ? (
                                <div className="space-y-1">
                                  <div className="font-black">{cell.value}</div>
                                  {cell.unit ? <div className="text-[10px] font-bold uppercase tracking-[0.16em]">{cell.unit}</div> : null}
                                </div>
                              ) : editMode ? (
                                <span className="text-xs font-black uppercase tracking-[0.16em]">Add</span>
                              ) : (
                                <span>&nbsp;</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>

        {editMode ? (
          <div className="rounded-[2rem] border border-[color:var(--border)] bg-[var(--surface-strong)] p-5 shadow-xl shadow-slate-200/30">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-600">Row Editor</p>
                <h3 className="text-lg font-black text-slate-900">
                  {editor ? (editor.sourceType === 'new' ? 'Add Manual Key Call' : 'Edit Effective Value') : 'Select A Cell'}
                </h3>
              </div>
              {editor ? (
                <button
                  onClick={() => setEditor(null)}
                  className="p-2 rounded-xl border border-[color:var(--border)] text-slate-400 hover:text-slate-700"
                  title="Close editor"
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>

            {editor ? (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Indicator</span>
                  <input
                    list="key-call-indicator-options"
                    value={editor.indicator}
                    onChange={(event) => setEditor({ ...editor, indicator: event.target.value })}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-slate-900 outline-none"
                    placeholder="GDP forecast, Inflation forecast, Exports"
                  />
                  <datalist id="key-call-indicator-options">
                    {indicatorOptions.map((option) => <option key={option} value={option} />)}
                  </datalist>
                </label>

                <label className="block space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">House</span>
                  <input
                    list="key-call-house-options"
                    value={editor.house}
                    onChange={(event) => setEditor({ ...editor, house: event.target.value })}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-slate-900 outline-none"
                  />
                  <datalist id="key-call-house-options">
                    {houseOptions.map((option) => <option key={option} value={option} />)}
                  </datalist>
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Value</span>
                    <input
                      value={editor.value}
                      onChange={(event) => setEditor({ ...editor, value: event.target.value })}
                      className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-slate-900 outline-none"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Unit</span>
                    <input
                      value={editor.unit}
                      onChange={(event) => setEditor({ ...editor, unit: event.target.value })}
                      className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-slate-900 outline-none"
                      placeholder="%YoY, %, USD, THB"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Forecast Period</span>
                    <input
                      value={editor.forecast_period}
                      onChange={(event) => setEditor({ ...editor, forecast_period: event.target.value })}
                      className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-slate-900 outline-none"
                      placeholder={`${formatShortFiscalYear(baseYear)}, 1Q${String(baseYear).slice(-2)}, ${formatShortFiscalYear(baseYear + 1)}`}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Value Date</span>
                    <input
                      value={editor.publish_date}
                      onChange={(event) => setEditor({ ...editor, publish_date: event.target.value })}
                      className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-slate-900 outline-none"
                      placeholder="Paper date or manual update date"
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Paper Name</span>
                  <input
                    value={editor.paper_name}
                    onChange={(event) => setEditor({ ...editor, paper_name: event.target.value })}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-slate-900 outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Source Note</span>
                  <textarea
                    value={editor.source_text}
                    onChange={(event) => setEditor({ ...editor, source_text: event.target.value })}
                    className="min-h-24 w-full rounded-xl border border-[color:var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-slate-900 outline-none"
                    placeholder="Optional provenance note"
                  />
                </label>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="text-xs font-semibold text-slate-500">
                    Source: <span className="font-black text-slate-800">{editor.sourceType === 'manual_input' ? 'Manual input' : editor.sourceType === 'extracted' ? 'Extracted row override' : 'New manual row'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(editor.manualId || editor.sourceType === 'extracted') ? (
                      <button
                        onClick={() => void handleDelete()}
                        disabled={saving}
                        className="px-3 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-sm font-black uppercase tracking-[0.16em] flex items-center gap-2 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    ) : null}
                    <button
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="px-4 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700 text-sm font-black uppercase tracking-[0.16em] flex items-center gap-2 disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[var(--surface-soft)] px-4 py-10 text-center text-sm text-slate-400">
                Turn on <span className="font-black text-slate-700">Edit Table</span>, then click a populated or blank cell to override it with `manual_input`.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
