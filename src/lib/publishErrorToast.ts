import type { IntlShape } from 'react-intl';

import { toast } from '@/hooks/useToast';
import { describePublishError } from '@/lib/publishError';

/** Explain a failed publish in a destructive toast. */
export function toastPublishError(intl: IntlShape, error: unknown): void {
  const { title, description, values } = describePublishError(error);
  toast({
    title: intl.formatMessage(title),
    description: intl.formatMessage(description, values),
    variant: 'destructive',
  });
}
