import { useState } from 'react';
import { Trash2, Plus, ChevronDown, ChevronUp, UserX, Hash, MessageSquareOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/useToast';
import { useMuteList, type MuteListItem } from '@/hooks/useMuteList';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export function MuteSettings() {
  const { muteItems, isLoading, addMute, removeMute } = useMuteList();
  const { toast } = useToast();
  const [newMuteType, setNewMuteType] = useState<MuteListItem['type']>('pubkey');
  const [newMuteValue, setNewMuteValue] = useState('');

  const handleAddMute = async () => {
    if (!newMuteValue.trim()) {
      toast({ title: 'Error', description: 'Please enter a value', variant: 'destructive' });
      return;
    }

    try {
      await addMute.mutateAsync({
        type: newMuteType,
        value: newMuteValue.trim(),
      });

      toast({ title: 'Success', description: 'Mute added successfully' });
      setNewMuteValue('');
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add mute',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveMute = async (item: MuteListItem) => {
    try {
      await removeMute.mutateAsync(item);
      toast({ title: 'Success', description: 'Mute removed successfully' });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove mute',
        variant: 'destructive',
      });
    }
  };

  const groupedMutes = {
    pubkey: muteItems.filter((item) => item.type === 'pubkey'),
    hashtag: muteItems.filter((item) => item.type === 'hashtag'),
    word: muteItems.filter((item) => item.type === 'word'),
    thread: muteItems.filter((item) => item.type === 'thread'),
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add Mute</CardTitle>
          <CardDescription>
            Mute users, hashtags, words, or entire threads. All mutes are encrypted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mute-type">Type</Label>
              <Select value={newMuteType} onValueChange={(value) => setNewMuteType(value as MuteListItem['type'])}>
                <SelectTrigger id="mute-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pubkey">
                    <div className="flex items-center gap-2">
                      <UserX className="h-4 w-4" />
                      User (pubkey)
                    </div>
                  </SelectItem>
                  <SelectItem value="hashtag">
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4" />
                      Hashtag
                    </div>
                  </SelectItem>
                  <SelectItem value="word">
                    <div className="flex items-center gap-2">
                      <MessageSquareOff className="h-4 w-4" />
                      Word/Phrase
                    </div>
                  </SelectItem>
                  <SelectItem value="thread">
                    <div className="flex items-center gap-2">
                      <MessageSquareOff className="h-4 w-4" />
                      Thread (event ID)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mute-value">
                {newMuteType === 'pubkey' ? 'Public Key (hex or npub)' :
                 newMuteType === 'hashtag' ? 'Hashtag (without #)' :
                 newMuteType === 'word' ? 'Word or Phrase' :
                 'Event ID (hex or note)'}
              </Label>
              <Input
                id="mute-value"
                value={newMuteValue}
                onChange={(e) => setNewMuteValue(e.target.value)}
                placeholder={
                  newMuteType === 'pubkey' ? 'npub1... or hex pubkey' :
                  newMuteType === 'hashtag' ? 'bitcoin' :
                  newMuteType === 'word' ? 'spam word' :
                  'note1... or hex event ID'
                }
              />
            </div>
          </div>

          <Button onClick={handleAddMute} disabled={addMute.isPending} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Add Mute
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Muted Items ({muteItems.length})</CardTitle>
          <CardDescription>
            Items you've muted will be hidden from your feeds
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : muteItems.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No muted items yet
            </p>
          ) : (
            <div className="space-y-6">
              {groupedMutes.pubkey.length > 0 && (
                <MuteSection
                  title="Muted Users"
                  icon={<UserX className="h-4 w-4" />}
                  items={groupedMutes.pubkey}
                  onRemove={handleRemoveMute}
                  isPending={removeMute.isPending}
                />
              )}
              {groupedMutes.hashtag.length > 0 && (
                <MuteSection
                  title="Muted Hashtags"
                  icon={<Hash className="h-4 w-4" />}
                  items={groupedMutes.hashtag}
                  onRemove={handleRemoveMute}
                  isPending={removeMute.isPending}
                />
              )}
              {groupedMutes.word.length > 0 && (
                <MuteSection
                  title="Muted Words"
                  icon={<MessageSquareOff className="h-4 w-4" />}
                  items={groupedMutes.word}
                  onRemove={handleRemoveMute}
                  isPending={removeMute.isPending}
                />
              )}
              {groupedMutes.thread.length > 0 && (
                <MuteSection
                  title="Muted Threads"
                  icon={<MessageSquareOff className="h-4 w-4" />}
                  items={groupedMutes.thread}
                  onRemove={handleRemoveMute}
                  isPending={removeMute.isPending}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MuteSection({
  title,
  icon,
  items,
  onRemove,
  isPending,
}: {
  title: string;
  icon: React.ReactNode;
  items: MuteListItem[];
  onRemove: (item: MuteListItem) => void;
  isPending: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-0 h-auto font-semibold">
          <div className="flex items-center gap-2">
            {icon}
            {title} ({items.length})
          </div>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 mt-2">
        {items.map((item, index) => (
          <div
            key={`${item.type}-${item.value}-${index}`}
            className="flex items-center justify-between p-3 border rounded-lg"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <code className="text-sm truncate">{item.value}</code>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(item)}
              disabled={isPending}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
