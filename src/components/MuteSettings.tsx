import { useState } from 'react';
import { Trash2, Plus, UserX, Hash, MessageSquareOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
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

const MUTE_TYPE_CONFIG = {
  pubkey: {
    icon: <UserX className="size-5" />,
    label: 'Users',
    description: 'Hide posts from specific users',
    inputLabel: 'Public Key (hex or npub)',
    placeholder: 'npub1... or hex pubkey',
  },
  hashtag: {
    icon: <Hash className="size-5" />,
    label: 'Hashtags',
    description: 'Hide posts with specific hashtags',
    inputLabel: 'Hashtag (without #)',
    placeholder: 'bitcoin',
  },
  word: {
    icon: <MessageSquareOff className="size-5" />,
    label: 'Words',
    description: 'Hide posts containing specific words or phrases',
    inputLabel: 'Word or Phrase',
    placeholder: 'spam word',
  },
  thread: {
    icon: <MessageSquareOff className="size-5" />,
    label: 'Threads',
    description: 'Hide entire conversation threads',
    inputLabel: 'Event ID (hex or note)',
    placeholder: 'note1... or hex event ID',
  },
};

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
    <div>
      {/* Intro */}
      <div className="flex items-center gap-4 px-3 pt-2 pb-4">
        <img
          src="/mute-intro.png"
          alt=""
          className="w-40 shrink-0 mix-blend-difference opacity-80"
        />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Content Control</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Hide posts from specific users, hashtags, words, or entire threads. All mutes are encrypted and private.
          </p>
        </div>
      </div>

      {/* Add mute section */}
      <div className="border-b border-border pb-4 mb-4">
        <div className="px-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mute-type" className="text-xs font-medium">Type</Label>
              <Select value={newMuteType} onValueChange={(value) => setNewMuteType(value as MuteListItem['type'])}>
                <SelectTrigger id="mute-type" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pubkey">
                    <div className="flex items-center gap-2">
                      <UserX className="h-4 w-4" />
                      User
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
                      Thread
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mute-value" className="text-xs font-medium">
                {MUTE_TYPE_CONFIG[newMuteType].inputLabel}
              </Label>
              <Input
                id="mute-value"
                value={newMuteValue}
                onChange={(e) => setNewMuteValue(e.target.value)}
                placeholder={MUTE_TYPE_CONFIG[newMuteType].placeholder}
                className="h-9"
              />
            </div>
          </div>

          <Button 
            onClick={handleAddMute} 
            disabled={addMute.isPending} 
            size="sm"
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Mute
          </Button>
        </div>
      </div>

      {/* Muted items list */}
      {isLoading ? (
        <div className="space-y-2 px-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : muteItems.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 text-sm">
          No muted items yet
        </p>
      ) : (
        <>
          {Object.entries(groupedMutes).map(([type, items]) => {
            if (items.length === 0) return null;
            const config = MUTE_TYPE_CONFIG[type as MuteListItem['type']];
            
            return (
              <MuteTypeSection
                key={type}
                type={type as MuteListItem['type']}
                config={config}
                items={items}
                onRemove={handleRemoveMute}
                isPending={removeMute.isPending}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

function MuteTypeSection({
  type,
  config,
  items,
  onRemove,
  isPending,
}: {
  type: MuteListItem['type'];
  config: typeof MUTE_TYPE_CONFIG[keyof typeof MUTE_TYPE_CONFIG];
  items: MuteListItem[];
  onRemove: (item: MuteListItem) => void;
  isPending: boolean;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-3.5 bg-muted/30">
        <span className="text-muted-foreground shrink-0">{config.icon}</span>
        <div className="min-w-0">
          <span className="text-sm font-medium">{config.label}</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            {items.length} {items.length === 1 ? 'item' : 'items'} • {config.description}
          </p>
        </div>
      </div>
      
      <div className="divide-y divide-border">
        {items.map((item, index) => (
          <div
            key={`${item.type}-${item.value}-${index}`}
            className="flex items-center justify-between py-2.5 px-3 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <code className="text-xs truncate font-mono bg-muted px-2 py-1 rounded">
                {item.value}
              </code>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(item)}
              disabled={isPending}
              className="shrink-0 h-8 w-8 p-0"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
