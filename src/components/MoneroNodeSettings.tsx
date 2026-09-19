import { useCallback, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneroGlyph } from '@/components/MoneroWalletPanel';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import {
  DEFAULT_MONERO_NODE_URLS,
  isMixedContent,
  nodeLabel,
  normalizeNodeUrl,
  testMoneroNode,
  type NodeProbeResult,
} from '@/lib/monero/nodes';

/**
 * Monero remote-node configuration.
 *
 * Deliberately more opinionated than the Esplora list above it, because the
 * failure modes are different. An Esplora endpoint that's down just fails over
 * to the next one. A Monero node has to satisfy a browser-only constraint —
 * CORS headers on the binary `/getblocks.bin` endpoint — that most public
 * nodes don't, and a node failing that check produces no useful browser error.
 * So this section ships a "Test" button and names the CORS case explicitly,
 * rather than leaving the user to guess why a node that works in Cake Wallet
 * does nothing here.
 */
export function MoneroNodeSettings() {
  const intl = useIntl();
  const { toast } = useToast();
  const { config, updateConfig } = useAppContext();

  const nodes = config.moneroNodes;
  const [newUrl, setNewUrl] = useState('');
  const [probes, setProbes] = useState<Record<string, NodeProbeResult | 'testing'>>({});

  const isAtDefaults =
    nodes.length === DEFAULT_MONERO_NODE_URLS.length &&
    nodes.every((url, i) => url === DEFAULT_MONERO_NODE_URLS[i]);

  const saveNodes = useCallback(
    (next: string[]) => {
      updateConfig((current) => ({ ...current, moneroNodes: next }));
    },
    [updateConfig],
  );

  const handleAdd = useCallback(() => {
    const normalized = normalizeNodeUrl(newUrl);
    if (!normalized) {
      toast({
        title: intl.formatMessage({
          id: 'settings.monero.invalidUrl',
          defaultMessage: 'Invalid node address',
        }),
        description: intl.formatMessage({
          id: 'settings.monero.invalidUrl.description',
          defaultMessage: 'Enter a host and port, e.g. node.example.org:18089',
        }),
        variant: 'destructive',
      });
      return;
    }
    if (nodes.includes(normalized)) {
      toast({
        title: intl.formatMessage({
          id: 'settings.monero.duplicate',
          defaultMessage: 'That node is already in the list',
        }),
        variant: 'destructive',
      });
      return;
    }
    saveNodes([...nodes, normalized]);
    setNewUrl('');
  }, [newUrl, nodes, saveNodes, toast, intl]);

  const handleRemove = useCallback(
    (url: string) => {
      if (nodes.length <= 1) {
        toast({
          title: intl.formatMessage({
            id: 'settings.monero.oneRequired',
            defaultMessage: 'At least one node is required',
          }),
          variant: 'destructive',
        });
        return;
      }
      saveNodes(nodes.filter((u) => u !== url));
    },
    [nodes, saveNodes, toast, intl],
  );

  const handleMove = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= nodes.length) return;
      const next = [...nodes];
      [next[index], next[target]] = [next[target], next[index]];
      saveNodes(next);
    },
    [nodes, saveNodes],
  );

  const handleTest = useCallback(async (url: string) => {
    setProbes((prev) => ({ ...prev, [url]: 'testing' }));
    const result = await testMoneroNode(url);
    setProbes((prev) => ({ ...prev, [url]: result }));
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">
          <FormattedMessage id="settings.monero.title" defaultMessage="Monero nodes" />
        </h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => saveNodes([...DEFAULT_MONERO_NODE_URLS])}
          disabled={isAtDefaults}
          className="rounded-full text-xs h-7"
        >
          <RotateCcw className="size-3.5 mr-1" />
          <FormattedMessage id="settings.wallet.restoreDefaults" defaultMessage="Restore defaults" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground px-1">
        <FormattedMessage
          id="settings.monero.description"
          defaultMessage="Your Monero wallet scans the blockchain through these nodes. A node sees your IP address and when you ask for blocks — never your keys, balance, or which outputs are yours. The first reachable node is used."
        />
      </p>

      <p className="text-xs text-muted-foreground px-1">
        <FormattedMessage
          id="settings.monero.corsNote"
          defaultMessage="Nodes must send CORS headers to work in a browser. Most public nodes don't, even ones that work fine in other Monero wallets — use Test to check before relying on one."
        />
      </p>

      <div className="space-y-2">
        {nodes.map((url, index) => {
          const probe = probes[url];
          const mixed = isMixedContent(url);

          return (
            <Card key={url}>
              <CardContent className="flex items-center justify-between gap-2 p-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex items-center justify-center size-9 rounded-full bg-secondary shrink-0">
                    <MoneroGlyph className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" title={url}>
                      {nodeLabel(url)}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{url}</p>

                    {index === 0 && (
                      <p className="text-xs text-muted-foreground">
                        <FormattedMessage id="settings.wallet.primary" defaultMessage="Primary" />
                      </p>
                    )}

                    {mixed && (
                      <p className="flex items-center gap-1 text-xs text-orange-500 pt-0.5">
                        <TriangleAlert className="size-3 shrink-0" />
                        <FormattedMessage
                          id="settings.monero.mixedContent"
                          defaultMessage="Blocked over http on an https page"
                        />
                      </p>
                    )}

                    {probe && probe !== 'testing' && (
                      <p
                        className={`flex items-center gap-1 text-xs pt-0.5 ${
                          probe.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                        }`}
                      >
                        {probe.ok ? (
                          <>
                            <Check className="size-3 shrink-0" />
                            <FormattedMessage
                              id="settings.monero.probeOk"
                              defaultMessage="{ms}ms · height {height}"
                              values={{
                                ms: probe.responseMs ?? 0,
                                height: (probe.height ?? 0).toLocaleString(),
                              }}
                            />
                          </>
                        ) : (
                          <>
                            <TriangleAlert className="size-3 shrink-0" />
                            {probe.error === 'cors' ? (
                              <FormattedMessage
                                id="settings.monero.probeCors"
                                defaultMessage="Unreachable — likely no CORS support"
                              />
                            ) : probe.error === 'timeout' ? (
                              <FormattedMessage
                                id="settings.monero.probeTimeout"
                                defaultMessage="Timed out"
                              />
                            ) : (
                              <FormattedMessage
                                id="settings.monero.probeFailed"
                                defaultMessage="Unreachable"
                              />
                            )}
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleTest(url)}
                    disabled={probe === 'testing'}
                    className="rounded-full text-xs h-8 px-2"
                  >
                    {probe === 'testing' ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <FormattedMessage id="settings.monero.test" defaultMessage="Test" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleMove(index, -1)}
                    disabled={index === 0}
                    className="rounded-full size-8 p-0"
                    title={intl.formatMessage({
                      id: 'settings.wallet.moveUp',
                      defaultMessage: 'Move up',
                    })}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleMove(index, 1)}
                    disabled={index === nodes.length - 1}
                    className="rounded-full size-8 p-0"
                    title={intl.formatMessage({
                      id: 'settings.wallet.moveDown',
                      defaultMessage: 'Move down',
                    })}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemove(url)}
                    disabled={nodes.length <= 1}
                    className="rounded-full size-8 p-0 text-muted-foreground hover:text-destructive"
                    title={intl.formatMessage({
                      id: 'settings.wallet.remove',
                      defaultMessage: 'Remove',
                    })}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-2 px-1">
        <div className="flex-1">
          <Label htmlFor="new-monero-node" className="sr-only">
            <FormattedMessage id="settings.monero.urlLabel" defaultMessage="Monero node address" />
          </Label>
          <Input
            id="new-monero-node"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            placeholder="node.example.org:18089"
            className="h-9 text-base md:text-sm font-mono"
          />
        </div>
        <Button
          onClick={handleAdd}
          disabled={!newUrl.trim()}
          variant="outline"
          size="sm"
          className="h-9 shrink-0 text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          <FormattedMessage id="common.add" defaultMessage="Add" />
        </Button>
      </div>
    </div>
  );
}
