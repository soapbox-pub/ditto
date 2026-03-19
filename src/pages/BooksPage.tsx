import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookMarked, Loader2, Search, X } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';

import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { KindInfoButton } from '@/components/KindInfoButton';
import { BookFeedItem, BookFeedItemSkeleton } from '@/components/BookFeedItem';
import { useBookFeed } from '@/hooks/useBookFeed';
import { useBookSearch, type BookSearchResult } from '@/hooks/useBookSearch';
import { usePrefetchBookSummaries } from '@/hooks/useBookSummary';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedTab } from '@/hooks/useFeedTab';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import type { ExtraKindDef } from '@/lib/extraKinds';

type FeedTab = 'follows' | 'global';

const booksDef: ExtraKindDef = {
  kind: 31985,
  id: 'books',
  label: 'Books',
  description: 'Book reviews and discussions',
  addressable: true,
  section: 'social',
  blurb: 'Discover book reviews, ratings, and discussions from the Nostr community. Track your reading and share your thoughts using the Bookstr protocol.',
  sites: [{ url: 'https://bookstr.xyz/', name: 'Bookstr' }],
};

export function BooksPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useFeedTab<FeedTab>('books', ['follows', 'global']);

  useSeoMeta({
    title: `Books | ${config.appName}`,
    description: 'Book reviews, ratings, and discussions from the Nostr community',
  });

  useLayoutOptions({ hasSubHeader: true });

  const feedQuery = useBookFeed(activeTab);

  const {
    data: rawData,
    isPending,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = feedQuery;

  // Auto-fetch page 2 for smoother scrolling
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && rawData?.pages?.length === 1) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, rawData?.pages?.length, fetchNextPage]);

  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['book-feed', activeTab] });
  }, [queryClient, activeTab]);

  // Flatten and deduplicate across pages
  const events = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();
    return rawData.pages
      .flat()
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      });
  }, [rawData?.pages]);

  // Batch-prefetch book metadata for all visible ISBNs (4 concurrent requests)
  usePrefetchBookSummaries(events);

  const showSkeleton = isPending || (isLoading && !rawData);

  return (
    <main className="pb-16 sidebar:pb-0">
      {/* Follows / Global tabs */}
      {user && (
        <SubHeaderBar>
          <TabButton label="Follows" active={activeTab === 'follows'} onClick={() => setActiveTab('follows')} />
          <TabButton label="Global" active={activeTab === 'global'} onClick={() => setActiveTab('global')} />
        </SubHeaderBar>
      )}

      {/* Page header */}
      <div className="flex items-center gap-4 px-4 mt-4 mb-1">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <BookMarked className="size-5" />
          <h1 className="text-xl font-bold">Books</h1>
        </div>
        <KindInfoButton kindDef={booksDef} icon={<BookMarked className="size-10" />} />
      </div>

      {/* Book search bar */}
      <BookSearchBar />

      <PullToRefresh onRefresh={handleRefresh}>
        {showSkeleton ? (
          <div>
            {Array.from({ length: 6 }).map((_, i) => (
              <BookFeedItemSkeleton key={i} />
            ))}
          </div>
        ) : events.length > 0 ? (
          <div>
            {events.map((event) => (
              <BookFeedItem key={event.id} event={event} />
            ))}

            {hasNextPage && (
              <div ref={scrollRef} className="py-4">
                {isFetchingNextPage && (
                  <div className="flex justify-center">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <FeedEmptyState
            message={
              activeTab === 'follows'
                ? 'No book posts from people you follow yet.'
                : 'No book posts or reviews found. Book-related posts tagged with #bookstr or referencing ISBNs will appear here.'
            }
            onSwitchToGlobal={activeTab === 'follows' ? () => setActiveTab('global') : undefined}
          />
        )}
      </PullToRefresh>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Book Search Bar
// ---------------------------------------------------------------------------

function BookSearchBar() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { data: results, isFetching } = useBookSearch(debouncedQuery);

  // 300ms debounce
  const handleChange = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value.trim());
    }, 300);
  }, []);

  // Cleanup debounce timer
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Open dropdown when we have results and input is focused
  useEffect(() => {
    if (debouncedQuery.length >= 2 && results && results.length > 0) {
      setDropdownOpen(true);
    } else if (debouncedQuery.length >= 2 && results && results.length === 0 && !isFetching) {
      setDropdownOpen(true); // show "no results"
    }
  }, [debouncedQuery, results, isFetching]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback((isbn: string) => {
    setQuery('');
    setDebouncedQuery('');
    setDropdownOpen(false);
    inputRef.current?.blur();
    navigate(`/i/isbn:${isbn}`);
  }, [navigate]);

  const handleClear = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setDropdownOpen(false);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setDropdownOpen(false);
      inputRef.current?.blur();
    }
    if (e.key === 'Enter' && results && results.length > 0) {
      e.preventDefault();
      handleSelect(results[0].isbn);
    }
  }, [results, handleSelect]);

  return (
    <div ref={containerRef} className="relative px-4 pb-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search books by title, author..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (debouncedQuery.length >= 2) setDropdownOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-9 h-9 text-base md:text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Search results dropdown */}
      {dropdownOpen && debouncedQuery.length >= 2 && (
        <div className="absolute left-4 right-4 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          {isFetching && (!results || results.length === 0) ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="w-8 h-11 rounded shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : results && results.length > 0 ? (
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {results.map((book) => (
                <BookSearchResultItem
                  key={book.isbn}
                  book={book}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No books found for &ldquo;{debouncedQuery}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BookSearchResultItem({ book, onSelect }: { book: BookSearchResult; onSelect: (isbn: string) => void }) {
  return (
    <button
      type="button"
      className="flex items-center gap-3 px-3 py-2.5 w-full text-left hover:bg-secondary/60 transition-colors"
      onClick={() => onSelect(book.isbn)}
    >
      {book.coverUrl ? (
        <img
          src={book.coverUrl}
          alt=""
          className="w-8 h-11 rounded object-cover shrink-0"
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-8 h-11 rounded bg-secondary flex items-center justify-center shrink-0">
          <BookMarked className="size-3.5 text-muted-foreground/40" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{book.title}</p>
        {book.authors.length > 0 && (
          <p className="text-xs text-muted-foreground truncate">{book.authors.join(', ')}</p>
        )}
        {book.firstPublishYear && (
          <p className="text-xs text-muted-foreground/60">{book.firstPublishYear}</p>
        )}
      </div>
    </button>
  );
}
