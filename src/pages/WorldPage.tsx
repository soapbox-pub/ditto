import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Earth, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { useAppContext } from '@/hooks/useAppContext';
import { COUNTRIES } from '@/lib/countries';

/** Pre-sorted list of country entries for stable rendering. */
const COUNTRY_LIST = Object.entries(COUNTRIES)
  .map(([code, { name, flag }]) => ({ code, name, flag }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function WorldPage() {
  const { config } = useAppContext();
  const [search, setSearch] = useState('');

  useSeoMeta({
    title: `World | ${config.appName}`,
    description: 'Browse countries and join the conversation',
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return COUNTRY_LIST;
    const q = search.trim().toLowerCase();
    return COUNTRY_LIST.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [search]);

  return (
    <main className="">
      {/* Header */}
      <PageHeader title="World" icon={<Earth className="size-5" />} backTo="/" />

      {/* Search */}
      <div className="px-4 pb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search countries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Country grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 px-4 pb-8">
          {filtered.map((c) => (
            <Link
              key={c.code}
              to={`/i/iso3166:${c.code}`}
              className="group flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-secondary/60"
            >
              <span className="text-4xl sm:text-5xl leading-none select-none transition-transform group-hover:scale-110" role="img" aria-label={`Flag of ${c.name}`}>
                {c.flag}
              </span>
              <span className="text-xs text-center font-medium text-muted-foreground group-hover:text-foreground transition-colors line-clamp-2 leading-tight">
                {c.name}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-16 px-8 text-center">
          <p className="text-muted-foreground">No countries match "{search}"</p>
        </div>
      )}
    </main>
  );
}
