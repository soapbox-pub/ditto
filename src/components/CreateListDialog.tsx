import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/useToast';
import { usePersonalLists } from '@/hooks/usePersonalLists';

interface CreateListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateListDialog({ open, onOpenChange }: CreateListDialogProps) {
  const { toast } = useToast();
  const { createList } = usePersonalLists();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      await createList.mutateAsync({ title: title.trim(), description: description.trim() || undefined });
      toast({ title: 'List created!' });
      setTitle('');
      setDescription('');
      onOpenChange(false);
    } catch {
      toast({ title: 'Failed to create list', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New List</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Input
              placeholder="List name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              autoFocus
            />
          </div>
          <div>
            <Textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <Button className="w-full" onClick={handleCreate} disabled={!title.trim() || createList.isPending}>
            {createList.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            Create List
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
