import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';

export function BlossomSettings() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const [newBlossomUrl, setNewBlossomUrl] = useState('');

  const handleAddBlossomServer = () => {
    const trimmed = newBlossomUrl.trim();
    if (!trimmed) return;

    let url: string;
    try {
      url = new URL(trimmed).toString();
    } catch {
      try {
        url = new URL(`https://${trimmed}`).toString();
      } catch {
        toast({ title: 'Invalid URL', variant: 'destructive' });
        return;
      }
    }

    if (config.blossomServers.includes(url)) {
      toast({ title: 'Server already added', variant: 'destructive' });
      return;
    }

    updateConfig(() => ({ blossomServers: [...config.blossomServers, url] }));
    setNewBlossomUrl('');
    toast({ title: 'Blossom server added' });
  };

  return (
    <div className="pt-4 pb-4">
      <div className="px-3 space-y-3">
        <h3 className="text-sm font-medium">Blossom Servers</h3>
        <p className="text-xs text-muted-foreground">
          File upload servers for media attachments. Files are uploaded to the first available server.
        </p>
      </div>

      {/* Server list */}
      <div className="mt-3">
        {config.blossomServers.length === 0 ? (
          <div className="text-xs text-muted-foreground py-8 text-center">
            No Blossom servers configured. Add a server below.
          </div>
        ) : (
          <div className="space-y-1">
            {config.blossomServers.map((server) => (
              <div
                key={server}
                className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/20 transition-colors"
              >
                <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs flex-1 truncate" title={server}>
                  {(() => {
                    try {
                      const parsed = new URL(server);
                      return parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname);
                    } catch {
                      return server;
                    }
                  })()}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const updated = config.blossomServers.filter((s) => s !== server);
                    updateConfig(() => ({ blossomServers: updated }));
                    toast({ title: 'Blossom server removed' });
                  }}
                  className="size-7 text-muted-foreground hover:text-destructive hover:bg-transparent shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add server form */}
      <div className="px-3 mt-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <Label htmlFor="new-blossom-url" className="sr-only">
              Blossom Server URL
            </Label>
            <Input
              id="new-blossom-url"
              value={newBlossomUrl}
              onChange={(e) => setNewBlossomUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddBlossomServer();
              }}
              placeholder="https://blossom.example.com/"
              className="h-9 text-sm font-mono"
            />
          </div>
          <Button
            onClick={handleAddBlossomServer}
            disabled={!newBlossomUrl.trim()}
            variant="outline"
            size="sm"
            className="h-9 shrink-0 text-xs"
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
