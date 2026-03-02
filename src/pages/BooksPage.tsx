import { useSeoMeta } from '@unhead/react';
import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { usePopularBooks, type PopularBook } from '@/hooks/usePopularBooks';

export function BooksPage() {
  const { config } = useAppContext();
  const { data: books, isLoading } = usePopularBooks();

  useSeoMeta({
    title: `Books | ${config.appName}`,
    description: 'Popular books trending now on OpenLibrary',
  });

  return (
    <main className="pb-16 sidebar:pb-0">
      {/* Page header */}
      <div className="px-4 py-3.5 sidebar:py-5">
        <div className="flex items-center gap-2">
          <BookOpen className="size-5" />
          <h1 className="font-bold text-xl">Books</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Popular books trending now</p>
      </div>

      {/* Book list */}
      <div className="divide-y divide-border">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <BookSkeleton key={i} />
          ))
        ) : books && books.length > 0 ? (
          books.map((book) => (
            <BookItem key={book.isbn} book={book} />
          ))
        ) : (
          <div className="col-span-full">
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center">
                <div className="max-w-sm mx-auto space-y-6">
                  <p className="text-muted-foreground">
                    No books found. Try again later.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}

function BookItem({ book }: { book: PopularBook }) {
  return (
    <Link
      to={`/i/isbn:${book.isbn}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors"
    >
      {/* Cover */}
      <div className="shrink-0 w-12 h-[72px] rounded-md overflow-hidden bg-secondary/60">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="size-5 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate">{book.title}</p>
        {book.authors.length > 0 && (
          <p className="text-sm text-muted-foreground truncate">
            {book.authors.join(', ')}
          </p>
        )}
        {book.firstPublishYear && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {book.firstPublishYear}
          </p>
        )}
      </div>
    </Link>
  );
}

function BookSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <Skeleton className="w-12 h-[72px] rounded-md shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}
