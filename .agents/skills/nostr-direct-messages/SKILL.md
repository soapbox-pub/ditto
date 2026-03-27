---
name: nostr-direct-messages
description: Implement Nostr direct messaging features, build chat interfaces, or work with encrypted peer-to-peer communication (NIP-04 and NIP-17).
---

# Direct Messaging on Nostr

This project includes a complete direct messaging system supporting both NIP-04 (legacy) and NIP-17 (modern, more private) encrypted messages with real-time subscriptions, optimistic updates, and a persistent cache-first local storage.

**The DM system is not enabled by default** - follow the setup instructions below to add messaging functionality to your application.

## Setup Instructions

### 1. Add DMProvider to Your App

First, add the `DMProvider` to your app's provider tree in `src/App.tsx`:

```tsx
// Add these imports at the top of src/App.tsx
import { DMProvider, type DMConfig } from '@/components/DMProvider';
import { PROTOCOL_MODE } from '@/lib/dmConstants';

// Add this configuration before your App component
const dmConfig: DMConfig = {
  // Enable or disable DMs entirely
  enabled: true, // Set to true to enable messaging functionality

  // Choose one protocol mode:
  // PROTOCOL_MODE.NIP04_ONLY - Force NIP-04 (legacy) only
  // PROTOCOL_MODE.NIP17_ONLY - Force NIP-17 (private) only
  // PROTOCOL_MODE.NIP04_OR_NIP17 - Allow users to choose between NIP-04 and NIP-17 (defaults to NIP-17)
  protocolMode: PROTOCOL_MODE.NIP17_ONLY, // Recommended for new apps
};

// Then wrap your app components with DMProvider:
export function App() {
  return (
    <UnheadProvider head={head}>
      <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig}>
        <QueryClientProvider client={queryClient}>
          <NostrLoginProvider storageKey='nostr:login'>
            <NostrProvider>
              <NostrSync />
              <DMProvider config={dmConfig}>
                <TooltipProvider>
                  <Toaster />
                  <Suspense>
                    <AppRouter />
                  </Suspense>
                </TooltipProvider>
              </DMProvider>
            </NostrProvider>
          </NostrLoginProvider>
        </QueryClientProvider>
      </AppProvider>
    </UnheadProvider>
  );
}
```

### 2. Configure DM Settings

The `DMConfig` object supports the following options:

- `enabled` (boolean, default: `false`) - Enable/disable entire DM system. When false, no messages are loaded, stored, or processed.
- `protocolMode` (ProtocolMode, default: `PROTOCOL_MODE.NIP17_ONLY`) - Which protocols to support:
  - `PROTOCOL_MODE.NIP04_ONLY` - Legacy encryption only
  - `PROTOCOL_MODE.NIP17_ONLY` - Modern private messages (recommended)
  - `PROTOCOL_MODE.NIP04_OR_NIP17` - Support both protocols (for backwards compatibility)

**Note**: The DM system uses domain-based IndexedDB naming (`nostr-dm-store-${hostname}`) to prevent conflicts between multiple apps on the same domain.

## Quick Start

### 1. Send Messages

```tsx
import { useDMContext } from '@/hooks/useDMContext';
import { MESSAGE_PROTOCOL } from '@/lib/dmConstants';

function ComposeMessage({ recipientPubkey }: { recipientPubkey: string }) {
  const { sendMessage } = useDMContext();
  const [content, setContent] = useState('');

  const handleSend = async () => {
    await sendMessage({
      recipientPubkey,
      content,
      protocol: MESSAGE_PROTOCOL.NIP17, // Uses NIP-44 encryption + gift wrapping
    });
    setContent('');
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Type a message..."
      />
      <button type="submit">Send</button>
    </form>
  );
}
```

### 2. Display Conversations

```tsx
import { useDMContext } from '@/hooks/useDMContext';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';

function ConversationList({ onSelectConversation }: { onSelectConversation: (pubkey: string) => void }) {
  const { conversations, isLoading } = useDMContext();

  if (isLoading) {
    return <div>Loading conversations...</div>;
  }

  return (
    <div className="space-y-2">
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.pubkey}
          conversation={conversation}
          onClick={() => onSelectConversation(conversation.pubkey)}
        />
      ))}
    </div>
  );
}

function ConversationItem({ conversation, onClick }: {
  conversation: ConversationSummary;
  onClick: () => void;
}) {
  const author = useAuthor(conversation.pubkey);
  const displayName = author.data?.metadata?.name || genUserName(conversation.pubkey);
  const avatarUrl = author.data?.metadata?.picture;

  return (
    <button onClick={onClick} className="w-full p-3 hover:bg-accent rounded-lg">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={avatarUrl} />
          <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 text-left">
          <div className="font-medium">{displayName}</div>
          <div className="text-sm text-muted-foreground truncate">
            {conversation.lastMessage?.decryptedContent || 'No messages yet'}
          </div>
        </div>
      </div>
    </button>
  );
}
```

### 3. Display Messages in a Conversation

```tsx
import { useConversationMessages } from '@/hooks/useConversationMessages';
import { useCurrentUser } from '@/hooks/useCurrentUser';

function MessageThread({ conversationPubkey }: { conversationPubkey: string }) {
  const { user } = useCurrentUser();
  const { messages, hasMoreMessages, loadEarlierMessages } = useConversationMessages(conversationPubkey);

  return (
    <div className="flex flex-col space-y-2">
      {hasMoreMessages && (
        <button onClick={loadEarlierMessages} className="text-sm text-muted-foreground">
          Load earlier messages
        </button>
      )}

      {messages.map((message) => {
        const isFromMe = message.pubkey === user?.pubkey;

        return (
          <div
            key={message.id}
            className={cn(
              "flex",
              isFromMe ? "justify-end" : "justify-start"
            )}
          >
            <div className={cn(
              "max-w-[70%] rounded-lg px-4 py-2",
              isFromMe ? "bg-primary text-primary-foreground" : "bg-muted"
            )}>
              {message.error ? (
                <span className="text-red-500">🔒 {message.error}</span>
              ) : (
                <p className="whitespace-pre-wrap break-words">
                  {message.decryptedContent}
                </p>
              )}
              {message.isSending && (
                <span className="text-xs opacity-50">Sending...</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

## Using the Complete Messaging Interface

For a fully-featured messaging UI out of the box, use the `DMMessagingInterface` component:

```tsx
import { DMMessagingInterface } from "@/components/dm/DMMessagingInterface";

function MessagesPage() {
  return (
    <div className="container mx-auto p-4 h-screen">
      <DMMessagingInterface />
    </div>
  );
}
```

The `DMMessagingInterface` component provides a complete messaging UI with:
- Conversation list with Active/Requests tabs
- Message thread view with pagination
- Compose area with file upload support
- Real-time message updates
- Mobile-responsive layout (shows one panel at a time on mobile)

It requires no props and works automatically when wrapped in `DMProvider`.

**For custom layouts**, see the "Building Custom Messaging UIs" section below for individual components (`DMConversationList`, `DMChatArea`, `DMStatusInfo`).

## Sending Files with Messages

```tsx
import { useDMContext } from '@/hooks/useDMContext';
import { useUploadFile } from '@/hooks/useUploadFile';
import { MESSAGE_PROTOCOL } from '@/lib/dmConstants';
import type { FileAttachment } from '@/contexts/DMContext';

function ComposeWithFiles({ recipientPubkey }: { recipientPubkey: string }) {
  const { sendMessage } = useDMContext();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleSend = async () => {
    let attachments: FileAttachment[] | undefined;

    // Upload file if one is selected
    if (selectedFile) {
      const tags = await uploadFile(selectedFile);

      attachments = [{
        url: tags[0][1], // URL from first tag
        mimeType: selectedFile.type,
        size: selectedFile.size,
        name: selectedFile.name,
        tags: tags
      }];
    }

    await sendMessage({
      recipientPubkey,
      content,
      protocol: MESSAGE_PROTOCOL.NIP17,
      attachments,
    });

    setContent('');
    setSelectedFile(null);
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Type a message..."
      />

      <input
        type="file"
        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
      />

      {selectedFile && <div>Selected: {selectedFile.name}</div>}

      <button type="submit" disabled={isUploading}>
        {isUploading ? 'Uploading...' : 'Send'}
      </button>
    </form>
  );
}
```

## Protocol Comparison

### NIP-04 (Legacy)
- **Encryption**: NIP-04 (simpler, older)
- **Metadata**: Sender and recipient visible to relays
- **Event Kind**: Kind 4
- **Use When**: Compatibility with older clients

### NIP-17 (Modern & Private)
- **Encryption**: NIP-44 (stronger)
- **Metadata**: Hidden via gift wrapping (NIP-59)
- **Event Kinds**: Kind 14 (text), Kind 15 (files)
- **Wrapped In**: Kind 1059 (Gift Wrap) with ephemeral keys
- **Use When**: Maximum privacy (recommended)

**Key Privacy Features of NIP-17:**
- Sender identity hidden (uses random ephemeral keys)
- Timestamps randomized (±2 days) to hide send time
- Dual gift wraps (recipient + sender) for message history

## Advanced Features

### Conversation Categorization

The system automatically categorizes conversations:

```tsx
const { conversations } = useDMContext();

// Filter by category
const knownConversations = conversations.filter(c => c.isKnown);
const requestConversations = conversations.filter(c => c.isRequest);

// isKnown = true if user has sent at least one message
// isRequest = true if only received messages, never replied
```

### Loading States

```tsx
const { isLoading, loadingPhase, scanProgress } = useDMContext();

// Check overall loading state
if (isLoading) {
  console.log('Current phase:', loadingPhase);
  // LOADING_PHASES.CACHE - Loading from local cache
  // LOADING_PHASES.RELAYS - Querying relays
  // LOADING_PHASES.SUBSCRIPTIONS - Setting up real-time updates
  // LOADING_PHASES.READY - Fully loaded
}

// Display scan progress for large message histories
if (scanProgress.nip17) {
  console.log(`NIP-17: ${scanProgress.nip17.current} messages - ${scanProgress.nip17.status}`);
}
```

### Clear Cache and Refresh

```tsx
import { useDMContext } from '@/hooks/useDMContext';

function SettingsButton() {
  const { clearCacheAndRefetch } = useDMContext();

  const handleClearCache = async () => {
    await clearCacheAndRefetch();
    // Clears IndexedDB cache and reloads all messages from relays
  };

  return (
    <button onClick={handleClearCache}>
      Clear Message Cache
    </button>
  );
}
```

## Architecture Notes

### Data Flow
1. **Cache First**: Messages load instantly from encrypted IndexedDB cache
2. **Background Sync**: New messages fetched from relays in parallel
3. **Real-time Updates**: WebSocket subscriptions for live messages
4. **Optimistic UI**: Sent messages appear immediately, confirmed on relay response

### Storage
- **IndexedDB**: All messages stored locally with NIP-44 encryption
- **Per-User Storage**: Separate encrypted store for each logged-in user
- **Automatic Sync**: Debounced writes (15s) + immediate on new messages

### Performance
- **Parallel Queries**: NIP-04 and NIP-17 messages fetched simultaneously
- **Batched Loading**: Messages loaded in batches (1000/batch, 20k limit)
- **Pagination**: Conversation messages paginated (25/page)
- **Deduplication**: Automatic filtering of duplicate messages by ID

### Security
- **NIP-44 Encryption**: Modern authenticated encryption for all NIP-17 messages
- **Local Encryption**: IndexedDB storage encrypted with user's NIP-44 key
- **Ephemeral Keys**: Random keys for NIP-17 gift wraps (sender anonymity)
- **No Plaintext**: Decrypted content never persisted unencrypted
- **Domain Isolation**: IndexedDB databases are namespaced by hostname to prevent data conflicts

## Building Custom Messaging UIs

For advanced use cases, you can use the individual DM components to build custom layouts:

### Available Components

**`DMConversationList`** - Conversation sidebar with tabs
```tsx
import { DMConversationList } from '@/components/dm/DMConversationList';

<DMConversationList
  selectedPubkey={selectedPubkey}
  onSelectConversation={(pubkey) => setSelectedPubkey(pubkey)}
  onStatusClick={() => setShowStatus(true)} // optional
  className="h-full"
/>
```

**`DMChatArea`** - Message thread and compose area
```tsx
import { DMChatArea } from '@/components/dm/DMChatArea';

<DMChatArea
  pubkey={selectedPubkey}
  onBack={() => setSelectedPubkey(null)} // optional, for mobile back button
  className="h-full"
/>
```

**`DMStatusInfo`** - Debug/status panel
```tsx
import { DMStatusInfo } from '@/components/dm/DMStatusInfo';

<DMStatusInfo clearCacheAndRefetch={clearCacheAndRefetch} />
```

### Custom Layout Example

```tsx
import { useState } from 'react';
import { DMConversationList } from '@/components/dm/DMConversationList';
import { DMChatArea } from '@/components/dm/DMChatArea';

function CustomMessagingLayout() {
  const [selectedPubkey, setSelectedPubkey] = useState<string | null>(null);

  return (
    <div className="flex h-screen">
      {/* Custom sidebar */}
      <aside className="w-64 border-r">
        <DMConversationList
          selectedPubkey={selectedPubkey}
          onSelectConversation={setSelectedPubkey}
        />
      </aside>

      {/* Custom main area */}
      <main className="flex-1">
        {selectedPubkey ? (
          <DMChatArea pubkey={selectedPubkey} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p>Select a conversation to start messaging</p>
          </div>
        )}
      </main>
    </div>
  );
}
```

