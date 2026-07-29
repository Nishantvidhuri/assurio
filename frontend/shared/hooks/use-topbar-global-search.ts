'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/shared/http/api-client';
import {
  getAnimatedSearchSuggestionsConfigForUserType,
  handleTopbarGlobalSearchResultSelect,
} from '@/shared/lib/global-search-routing';

interface GlobalSearchResponse {
  query: string;
  total: number;
  hits: Array<{
    id: string;
    type: string;
    title?: string;
    label?: string;
    route?: string;
    subtext?: string;
  }>;
}

export interface TopbarSearchResult {
  pageName: string;
  route: string;
  searchedText: string;
  subtext?: string;
}

function mapSearchHitsToTopbarResults(
  hits: GlobalSearchResponse['hits'],
  fallbackQuery: string,
): TopbarSearchResult[] {
  const mapped = hits
    .filter((hit) => Boolean(hit.route))
    .map((hit) => {
      const route = hit.route as string;
      const fallbackPageName = hit.type.charAt(0).toUpperCase() + hit.type.slice(1);
      return {
        pageName: hit.label ?? fallbackPageName,
        route,
        searchedText: hit.title?.trim() || fallbackQuery,
        subtext: hit.subtext,
      };
    });

  const seen = new Set<string>();
  return mapped
    .filter((result) => {
      const key = `${result.pageName}::${result.searchedText}::${result.route}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

export function useTopbarGlobalSearch(
  userType: string,
  billingModel?: string | null,
) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchNoResults, setSearchNoResults] = useState(false);
  const [searchResults, setSearchResults] = useState<TopbarSearchResult[]>([]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestIdRef = useRef(0);

  const animationCfg = getAnimatedSearchSuggestionsConfigForUserType(
    userType,
    billingModel,
  );

  const onSearchResultSelect = useCallback(
    (route: string, searchedText: string) => {
      handleTopbarGlobalSearchResultSelect({
        router,
        route,
        searchedText,
        currentSearchValue: searchValue,
      });
    },
    [router, searchValue],
  );

  const onSearchSubmit = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      if (!q) return;

      const params = new URLSearchParams({ q });
      const response = await apiRequest<GlobalSearchResponse>(
        `/v1/search/global?${params.toString()}`,
      );

      const firstRoutableHit = response.hits.find((hit) => Boolean(hit.route));
      if (firstRoutableHit?.route) {
        handleTopbarGlobalSearchResultSelect({
          router,
          route: firstRoutableHit.route,
          searchedText: q,
          currentSearchValue: q,
        });
      }
    },
    [router],
  );

  const onSearchChange = useCallback((rawQuery: string) => {
    setSearchValue(rawQuery);
    const q = rawQuery.trim();

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (!q) {
      searchRequestIdRef.current += 1;
      setSearchLoading(false);
      setSearchNoResults(false);
      setSearchResults([]);
      return;
    }

    setSearchResults([]);
    setSearchNoResults(false);
    setSearchLoading(false);

    searchDebounceRef.current = setTimeout(() => {
      const reqId = ++searchRequestIdRef.current;
      setSearchLoading(true);
      setSearchNoResults(false);
      const params = new URLSearchParams({ q });

      void apiRequest<GlobalSearchResponse>(
        `/v1/search/global?${params.toString()}`,
      )
        .then((response) => {
          if (reqId !== searchRequestIdRef.current) return;
          const mapped = mapSearchHitsToTopbarResults(response.hits, q);
          setSearchResults(mapped);
          setSearchLoading(false);
          setSearchNoResults(mapped.length === 0);
        })
        .catch(() => {
          if (reqId !== searchRequestIdRef.current) return;
          setSearchResults([]);
          setSearchLoading(false);
          setSearchNoResults(false);
        });
    }, 300);
  }, []);

  return {
    searchValue,
    searchLoading,
    searchNoResults,
    searchResults,
    onSearchChange,
    onSearchSubmit,
    onSearchResultSelect,
    enableAnimatedSearchSuggestions: animationCfg.enable,
    animatedSearchSuggestionsPreset: animationCfg.preset,
  };
}

