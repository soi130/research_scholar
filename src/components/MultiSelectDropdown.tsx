'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const buttonLabel = selected.length > 0 ? `${selected.length} selected` : `Select ${label.toLowerCase()}`;
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  const toggleValue = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selected.filter((item) => item !== value));
      return;
    }
    onChange([...selected, value].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })));
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (!next) setQuery('');
            return next;
          });
        }}
        className={cn(
          'w-full bg-[var(--surface-muted)] border border-[color:var(--border)] rounded-2xl px-4 py-2.5 text-left text-sm shadow-inner flex items-center justify-between gap-3',
          open ? 'border-violet-500/30 bg-[var(--surface-strong)]' : ''
        )}
      >
        <span className="truncate">{buttonLabel}</span>
        <ChevronDown size={16} className={cn('text-slate-400 transition-transform', open ? 'rotate-180' : '')} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 rounded-2xl border border-[color:var(--border)] bg-[var(--surface-strong)] shadow-2xl shadow-slate-200/30 max-h-64 overflow-y-auto">
          <div className="sticky top-0 z-10 p-3 border-b border-[color:var(--border)] bg-[var(--surface-strong)]">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Filter ${label.toLowerCase()}...`}
                className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--surface-muted)] py-2 pl-9 pr-9 text-sm outline-none focus:border-violet-500/30 focus:bg-[var(--surface-strong)]"
                autoFocus
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  title="Clear filter"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>
          {options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-400">No options available</div>
          ) : filteredOptions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-400">No matches found</div>
          ) : (
            filteredOptions.map((option) => {
              const isSelected = selectedSet.has(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleValue(option)}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--surface-muted)] flex items-center justify-between gap-3"
                >
                  <span className="truncate">{option}</span>
                  <span
                    className={cn(
                      'w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0',
                      isSelected ? 'border-violet-600 bg-violet-600 text-white' : 'border-[color:var(--border)] text-transparent'
                    )}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
