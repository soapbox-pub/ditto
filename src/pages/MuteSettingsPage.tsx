import { useState } from 'react';
import { Trash2, Plus, Filter, UserX, Hash, MessageSquareOff, Eye, EyeOff, Lock, Unlock, ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/useToast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMuteList, type MuteListItem } from '@/hooks/useMuteList';
import { useContentFilters, type ContentFilter, type FilterRule } from '@/hooks/useContentFilters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export default function MuteSettingsPage() {
  const { user } = useCurrentUser();
  const { toast } = useToast();

  if (!user) {
    return (
      <div className="container max-w-4xl mx-auto py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Please log in to manage mute settings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mute Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage what content you want to hide from your feeds
        </p>
      </div>

      <Tabs defaultValue="mutes" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="mutes">Mute List</TabsTrigger>
          <TabsTrigger value="filters">Content Filters</TabsTrigger>
        </TabsList>

        <TabsContent value="mutes" className="space-y-4">
          <MuteListTab />
        </TabsContent>

        <TabsContent value="filters" className="space-y-4">
          <ContentFiltersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MuteListTab() {
  const { muteItems, isLoading, addMute, removeMute } = useMuteList();
  const { toast } = useToast();
  const [newMuteType, setNewMuteType] = useState<MuteListItem['type']>('pubkey');
  const [newMuteValue, setNewMuteValue] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  const handleAddMute = async () => {
    if (!newMuteValue.trim()) {
      toast({ title: 'Error', description: 'Please enter a value', variant: 'destructive' });
      return;
    }

    try {
      await addMute.mutateAsync({
        type: newMuteType,
        value: newMuteValue.trim(),
        isPrivate,
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
    <>
      <Card>
        <CardHeader>
          <CardTitle>Add Mute</CardTitle>
          <CardDescription>
            Mute users, hashtags, words, or entire threads. Private mutes are encrypted.
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

          <div className="flex items-center space-x-2">
            <Switch
              id="private-mute"
              checked={isPrivate}
              onCheckedChange={setIsPrivate}
            />
            <Label htmlFor="private-mute" className="flex items-center gap-2">
              {isPrivate ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              Private (encrypted)
            </Label>
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
    </>
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
            key={`${item.type}-${item.value}-${item.isPrivate}-${index}`}
            className="flex items-center justify-between p-3 border rounded-lg"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {item.isPrivate && <Lock className="h-3 w-3 flex-shrink-0 text-muted-foreground" />}
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

function ContentFiltersTab() {
  const { filters, isLoading, hasNip44Support, toggleFilter, deleteFilter } = useContentFilters();
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleToggle = async (filterId: string) => {
    try {
      await toggleFilter.mutateAsync(filterId);
      toast({ title: 'Success', description: 'Filter updated' });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to toggle filter',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (filterId: string) => {
    try {
      await deleteFilter.mutateAsync(filterId);
      toast({ title: 'Success', description: 'Filter deleted' });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete filter',
        variant: 'destructive',
      });
    }
  };

  if (!hasNip44Support) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            Content filters require NIP-44 encryption support.
            Please upgrade your signer extension to use this feature.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Content Filters</CardTitle>
              <CardDescription>
                Advanced client-side filtering with custom rules (stored encrypted)
              </CardDescription>
            </div>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Filter
                </Button>
              </DialogTrigger>
              <AddFilterDialog onClose={() => setShowAddDialog(false)} />
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : filters.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No content filters yet. Create one to get started.
            </p>
          ) : (
            <div className="space-y-4">
              {filters.map((filter) => (
                <Card key={filter.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={filter.enabled}
                          onCheckedChange={() => handleToggle(filter.id)}
                        />
                        <div>
                          <CardTitle className="text-base">{filter.name}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline">
                              {filter.rules.length} rule{filter.rules.length !== 1 ? 's' : ''}
                            </Badge>
                            {filter.enabled ? (
                              <Badge variant="default">
                                <Eye className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <EyeOff className="h-3 w-3 mr-1" />
                                Inactive
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(filter.id)}
                        disabled={deleteFilter.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {filter.rules.map((rule, index) => (
                        <div key={index} className="text-sm border rounded p-2">
                          <code className="text-xs">
                            {rule.type === 'kind' && `Kind ${rule.operator} "${rule.value}"`}
                            {rule.type === 'content-regex' && `Content ${rule.operator} "${rule.value}"`}
                            {rule.type === 'tag' && `Tag "${rule.field}" ${rule.operator} "${rule.value}"`}
                          </code>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function AddFilterDialog({ onClose }: { onClose: () => void }) {
  const { addFilter } = useContentFilters();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [rules, setRules] = useState<FilterRule[]>([
    { type: 'content-regex', operator: 'contains', value: '' },
  ]);

  const handleAddRule = () => {
    setRules([...rules, { type: 'content-regex', operator: 'contains', value: '' }]);
  };

  const handleRemoveRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleRuleChange = (index: number, field: keyof FilterRule, value: any) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], [field]: value };
    setRules(newRules);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: 'Error', description: 'Please enter a filter name', variant: 'destructive' });
      return;
    }

    if (rules.some((rule) => !rule.value.trim())) {
      toast({ title: 'Error', description: 'All rules must have a value', variant: 'destructive' });
      return;
    }

    try {
      await addFilter.mutateAsync({
        name: name.trim(),
        enabled: true,
        rules,
      });

      toast({ title: 'Success', description: 'Filter created successfully' });
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create filter',
        variant: 'destructive',
      });
    }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Create Content Filter</DialogTitle>
        <DialogDescription>
          Create a custom filter with multiple rules. All rules must match for content to be filtered.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="filter-name">Filter Name</Label>
          <Input
            id="filter-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Hide promotional content"
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Filter Rules</Label>
            <Button variant="outline" size="sm" onClick={handleAddRule}>
              <Plus className="h-4 w-4 mr-1" />
              Add Rule
            </Button>
          </div>

          {rules.map((rule, index) => (
            <Card key={index}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid gap-3 flex-1 sm:grid-cols-3">
                    <Select
                      value={rule.type}
                      onValueChange={(value) => handleRuleChange(index, 'type', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kind">Event Kind</SelectItem>
                        <SelectItem value="content-regex">Content</SelectItem>
                        <SelectItem value="tag">Tag</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={rule.operator}
                      onValueChange={(value) => handleRuleChange(index, 'operator', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equals">Equals</SelectItem>
                        <SelectItem value="not-equals">Not Equals</SelectItem>
                        <SelectItem value="contains">Contains</SelectItem>
                        <SelectItem value="not-contains">Not Contains</SelectItem>
                        <SelectItem value="regex">Regex</SelectItem>
                      </SelectContent>
                    </Select>

                    <Input
                      value={rule.value}
                      onChange={(e) => handleRuleChange(index, 'value', e.target.value)}
                      placeholder="Value"
                    />
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveRule(index)}
                    disabled={rules.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                {rule.type === 'tag' && (
                  <Input
                    value={rule.field || ''}
                    onChange={(e) => handleRuleChange(index, 'field', e.target.value)}
                    placeholder="Tag name (e.g., t, p, e)"
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={addFilter.isPending}>
          Create Filter
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
