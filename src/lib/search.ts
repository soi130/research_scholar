export const DEFAULT_PUBLISHED_FROM = '2026-01-01';
export const DEFAULT_PUBLISHED_TO = '2026-12-01';

export const MULTI_SELECT_SEARCH_FIELDS = ['authors', 'publisher', 'series_name', 'tags'] as const;

export type MultiSelectSearchField = (typeof MULTI_SELECT_SEARCH_FIELDS)[number];

export type AdvancedSearchFilters = {
  authors: string[];
  publisher: string[];
  series_name: string[];
  tags: string[];
  published_from: string;
  published_to: string;
};

export type SearchOptions = {
  authors: string[];
  publisher: string[];
  series_name: string[];
  tags: string[];
  dateBounds: {
    min: string;
    max: string;
  };
};

export function createEmptyAdvancedSearchFilters(): AdvancedSearchFilters {
  return {
    authors: [],
    publisher: [],
    series_name: [],
    tags: [],
    published_from: '',
    published_to: '',
  };
}

export function createDefaultAdvancedSearchDraft(): AdvancedSearchFilters {
  return {
    ...createEmptyAdvancedSearchFilters(),
    published_from: DEFAULT_PUBLISHED_FROM,
    published_to: DEFAULT_PUBLISHED_TO,
  };
}
