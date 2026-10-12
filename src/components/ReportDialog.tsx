import { useState } from 'react';
import { defineMessages, FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/hooks/useToast';
import { REPORT_KIND, type ReportType } from '@/lib/report';
import type { NostrEvent } from '@nostrify/nostrify';

interface ReportEventProps {
  /** Report a specific post. */
  event: NostrEvent;
  pubkey?: never;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ReportProfileProps {
  /** Report a user profile. */
  pubkey: string;
  event?: never;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ReportDialogProps = ReportEventProps | ReportProfileProps;

const messages = defineMessages({
  spamLabel: { id: 'reportDialog.type.spam.label', defaultMessage: 'Spam' },
  spamDescription: { id: 'reportDialog.type.spam.description', defaultMessage: 'Unsolicited or repetitive content' },
  nudityLabel: { id: 'reportDialog.type.nudity.label', defaultMessage: 'Nudity or sexual content' },
  nudityDescription: { id: 'reportDialog.type.nudity.description', defaultMessage: 'Depictions of nudity or pornography' },
  impersonationLabel: { id: 'reportDialog.type.impersonation.label', defaultMessage: 'Impersonation' },
  impersonationDescription: { id: 'reportDialog.type.impersonation.description', defaultMessage: 'Pretending to be someone else' },
  profanityLabel: { id: 'reportDialog.type.profanity.label', defaultMessage: 'Hateful speech' },
  profanityDescription: { id: 'reportDialog.type.profanity.description', defaultMessage: 'Profanity, hateful or abusive speech' },
  illegalLabel: { id: 'reportDialog.type.illegal.label', defaultMessage: 'Illegal content' },
  illegalDescription: { id: 'reportDialog.type.illegal.description', defaultMessage: 'Content that may be illegal in some jurisdictions' },
  malwareLabel: { id: 'reportDialog.type.malware.label', defaultMessage: 'Malware' },
  malwareDescription: { id: 'reportDialog.type.malware.description', defaultMessage: 'Virus, trojan horse, spyware, or ransomware' },
  otherLabel: { id: 'reportDialog.type.other.label', defaultMessage: 'Other' },
  otherDescription: { id: 'reportDialog.type.other.description', defaultMessage: 'Something else not listed above' },
});

const REPORT_TYPES: { value: ReportType; label: MessageDescriptor; description: MessageDescriptor }[] = [
  { value: 'spam', label: messages.spamLabel, description: messages.spamDescription },
  { value: 'nudity', label: messages.nudityLabel, description: messages.nudityDescription },
  { value: 'impersonation', label: messages.impersonationLabel, description: messages.impersonationDescription },
  { value: 'profanity', label: messages.profanityLabel, description: messages.profanityDescription },
  { value: 'illegal', label: messages.illegalLabel, description: messages.illegalDescription },
  { value: 'malware', label: messages.malwareLabel, description: messages.malwareDescription },
  { value: 'other', label: messages.otherLabel, description: messages.otherDescription },
];

export function ReportDialog({ event, pubkey, open, onOpenChange }: ReportDialogProps) {
  const intl = useIntl();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const [reportType, setReportType] = useState<ReportType | ''>('');
  const [details, setDetails] = useState('');

  const isProfileReport = !!pubkey;
  const targetPubkey = event?.pubkey ?? pubkey;
  const canSubmit = reportType !== '' && !isPending;

  const handleSubmit = async () => {
    if (!reportType || !user || !targetPubkey) return;

    try {
      const tags: string[][] = [['p', targetPubkey, reportType]];
      if (event) {
        tags.unshift(['e', event.id, reportType]);
      }

      await publishEvent({
        kind: REPORT_KIND,
        content: details.trim(),
        tags,
      });
      toast({ title: intl.formatMessage({ id: 'reportDialog.submitted', defaultMessage: 'Report submitted' }) });
      setReportType('');
      setDetails('');
      onOpenChange(false);
    } catch {
      toast({
        title: intl.formatMessage({ id: 'reportDialog.submitFailed', defaultMessage: 'Failed to submit report' }),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85dvh] rounded-2xl flex flex-col overflow-hidden">
        <DialogTitle>
          {isProfileReport ? (
            <FormattedMessage id="reportDialog.titleUser" defaultMessage="Report user" />
          ) : (
            <FormattedMessage id="reportDialog.titlePost" defaultMessage="Report post" />
          )}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {isProfileReport ? (
            <FormattedMessage id="reportDialog.descriptionUser" defaultMessage="Select a reason for reporting this user." />
          ) : (
            <FormattedMessage id="reportDialog.descriptionPost" defaultMessage="Select a reason for reporting this post." />
          )}
        </DialogDescription>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          <RadioGroup
            value={reportType}
            onValueChange={(v) => setReportType(v as ReportType)}
            className="mt-2 space-y-1"
          >
            {REPORT_TYPES.map((type) => (
              <label
                key={type.value}
                className="flex items-start gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors hover:bg-secondary/60"
              >
                <RadioGroupItem value={type.value} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-medium"><FormattedMessage {...type.label} /></span>
                  <p className="text-xs text-muted-foreground mt-0.5"><FormattedMessage {...type.description} /></p>
                </div>
              </label>
            ))}
          </RadioGroup>

          <div className="mt-3 space-y-2 pb-1">
            <Label htmlFor="report-details" className="text-sm font-medium">
              <FormattedMessage id="reportDialog.details" defaultMessage="Additional details" />{' '}
              {reportType !== 'other' && (
                <span className="text-muted-foreground font-normal">
                  <FormattedMessage id="reportDialog.optional" defaultMessage="(optional)" />
                </span>
              )}
            </Label>
            <Textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={intl.formatMessage({ id: 'reportDialog.detailsPlaceholder', defaultMessage: 'Provide additional context...' })}
              className="resize-none"
              rows={2}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2 shrink-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? (
              <FormattedMessage id="reportDialog.submitting" defaultMessage="Submitting..." />
            ) : (
              <FormattedMessage id="reportDialog.submit" defaultMessage="Submit Report" />
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
