import { useMemo } from 'react';
import { ClientBarChart } from '@/components/ClientBarChart';
import { useClientCounts } from '@/hooks/useClientCounts';

const HOUR = 3600;
const MONTH = 30 * 24 * HOUR;

/** Distinct-author count via the Ditto relay's NIP-50 search extension. */
const DISTINCT_AUTHOR = 'distinct:author';

/** Snap to the start of the hour so the query key is stable across renders. */
function monthAgoSnapped(): number {
  const since = Math.floor(Date.now() / 1000) - MONTH;
  return Math.floor(since / HOUR) * HOUR;
}

interface ClientUsersChartProps {
  title?: string;
  description?: string;
  /** Render just the chart without the surrounding Card chrome (e.g. inside a sidebar widget). */
  bare?: boolean;
}

/**
 * Bar chart of distinct authors per NIP-89 client over the last 30 days.
 * Shared between the Trends page and the "Nostr Clients" sidebar widget.
 */
export function ClientUsersChart({
  title = 'Unique Users by Client',
  description = 'Distinct authors per client (last 30 days)',
  bare,
}: ClientUsersChartProps) {
  const since = useMemo(() => monthAgoSnapped(), []);
  const clientUsers = useClientCounts({ since, search: DISTINCT_AUTHOR });

  return (
    <ClientBarChart
      title={title}
      description={description}
      data={clientUsers.data}
      isLoading={clientUsers.isLoading}
      bare={bare}
    />
  );
}

export default ClientUsersChart;
