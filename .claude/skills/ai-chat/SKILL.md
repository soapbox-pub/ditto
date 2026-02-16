---
name: ai-chat
description: Build AI-powered chat interfaces, implement streaming responses, or integrate with Shakespeare AI.
---

# AI Integration with Shakespeare API

Use the `useShakespeare` hook for AI chat completions with Nostr authentication. The API dynamically provides available models, so you should query them at runtime rather than hardcoding model names.

```tsx
import { useShakespeare, type ChatMessage, type Model } from '@/hooks/useShakespeare';

const { 
  sendChatMessage, 
  sendStreamingMessage, 
  getAvailableModels, 
  isLoading, 
  error, 
  isAuthenticated 
} = useShakespeare();
```

#### Model Selector Component

```tsx
function ModelSelector({ onModelSelect }: { onModelSelect: (modelId: string) => void }) {
  const { getAvailableModels, isLoading } = useShakespeare();
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await getAvailableModels();
        // Sort models by total cost (cheapest first)
        const sortedModels = response.data.sort((a, b) => {
          const costA = parseFloat(a.pricing.prompt) + parseFloat(a.pricing.completion);
          const costB = parseFloat(b.pricing.prompt) + parseFloat(b.pricing.completion);
          return costA - costB;
        });
        setModels(sortedModels);
        
        // Select the cheapest model by default
        if (sortedModels.length > 0) {
          const cheapestModel = sortedModels[0];
          setSelectedModel(cheapestModel.id);
          onModelSelect(cheapestModel.id);
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
      }
    };

    fetchModels();
  }, [getAvailableModels, onModelSelect]);

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    onModelSelect(modelId);
  };

  return (
    <div>
      <label htmlFor="model-select">Choose Model:</label>
      <select 
        id="model-select"
        value={selectedModel} 
        onChange={(e) => handleModelChange(e.target.value)}
        disabled={isLoading}
      >
        <option value="">Select a model...</option>
        {models.map((model, index) => {
          const totalCost = parseFloat(model.pricing.prompt) + parseFloat(model.pricing.completion);
          const isCheapest = index === 0;
          return (
            <option key={model.id} value={model.id}>
              {model.name} - {isCheapest ? "Cheapest" : `$${totalCost.toFixed(6)}/token`}
            </option>
          );
        })}
      </select>
    </div>
  );
}
```

#### Basic Chat Example

```tsx
function AIChat() {
  const { sendChatMessage, isLoading, error, isAuthenticated } = useShakespeare();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('');

  const handleSend = async () => {
    if (!input.trim() || !selectedModel) return;

    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');

    try {
      const response = await sendChatMessage(newMessages, selectedModel);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.choices[0].message.content as string
      }]);
    } catch (err) {
      console.error('Chat error:', err);
    }
  };

  if (!isAuthenticated) return <div>Please log in to use AI</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      {error && <div className="text-red-500 mb-4">{error}</div>}

      {/* Model Selection */}
      <div className="mb-4">
        <ModelSelector onModelSelect={setSelectedModel} />
      </div>

      <div className="space-y-2 mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`p-2 rounded ${msg.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          className="flex-1 p-2 border rounded"
          disabled={isLoading || !selectedModel}
          placeholder={!selectedModel ? "Select a model first..." : "Type your message..."}
        />
        <button 
          onClick={handleSend} 
          disabled={isLoading || !selectedModel} 
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

#### Streaming Chat Example

```tsx
function StreamingChat() {
  const { sendStreamingMessage } = useShakespeare();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentResponse, setCurrentResponse] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('');

  const handleStreaming = async (content: string) => {
    if (!selectedModel) return;
    
    setCurrentResponse('');
    const newMessages = [...messages, { role: 'user', content }];
    setMessages(newMessages);

    try {
      await sendStreamingMessage(newMessages, selectedModel, (chunk) => {
        setCurrentResponse(prev => prev + chunk);
      });
      
      // Add the complete response to messages
      if (currentResponse.trim()) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: currentResponse
        }]);
      }
    } catch (err) {
      console.error('Streaming error:', err);
    } finally {
      setCurrentResponse('');
    }
  };

  return (
    <div>
      {/* Model selection UI */}
      <div className="mb-4">
        <ModelSelector onModelSelect={setSelectedModel} />
      </div>

      {/* Chat interface */}
      {/* ... rest of your chat UI */}
    </div>
  );
}
```

#### Model Information

Models are dynamically fetched from the Shakespeare API and include:

- **Model ID**: Unique identifier for the model
- **Name**: Human-readable model name
- **Description**: Model capabilities and use cases
- **Context Window**: Maximum token limit for conversations
- **Pricing**: Cost per token for prompt and completion
- **Free Models**: Models with `pricing.prompt === "0"` and `pricing.completion === "0"`

#### Key Points

- **Dynamic Model Discovery**: Always fetch available models using `getAvailableModels()`
- **Authentication Required**: User must be logged in with Nostr account
- **Free vs Premium**: Check pricing to determine if model requires credits
- **Error Handling**: Handle `isLoading` and `error` states appropriately
- **Model Selection**: Provide UI for users to choose between available models

## Implementation Patterns and Best Practices

### Dialog Component Patterns

When using Dialog components, always ensure accessibility compliance by including required elements:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// ✅ Correct - Always include DialogHeader with DialogTitle
<Dialog open={isOpen} onOpenChange={onClose}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>
        Optional description for screen readers
      </DialogDescription>
    </DialogHeader>
    {/* Dialog content */}
  </DialogContent>
</Dialog>
```

**Important**: Even if you want to hide the title visually, use the `VisuallyHidden` component to maintain accessibility:

```tsx
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

<DialogHeader>
  <VisuallyHidden>
    <DialogTitle>Hidden Title for Screen Readers</DialogTitle>
  </VisuallyHidden>
</DialogHeader>
```

### Streaming Response Handling

When implementing streaming chat interfaces, always accumulate streamed content in a local variable before clearing the streaming state to prevent content loss:

```tsx
const handleStreamingResponse = async () => {
  let streamedContent = ''; // ✅ Use local variable to accumulate content

  try {
    await sendStreamingMessage(messages, model, (chunk) => {
      streamedContent += chunk; // ✅ Accumulate in local variable
      setCurrentStreamingMessage(streamedContent); // Update UI
    });

    // ✅ Save accumulated content to persistent state
    if (streamedContent.trim()) {
      const assistantMessage: MessageDisplay = {
        id: Date.now().toString(),
        role: 'assistant',
        content: streamedContent, // ✅ Use accumulated content
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
    }
  } finally {
    setCurrentStreamingMessage(''); // ✅ Clear streaming state after saving
  }
};
```

### Error Boundary Patterns

Always wrap AI components with error boundaries and provide user-friendly error messages for common failure scenarios:

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Alert, AlertDescription } from '@/components/ui/alert';

function AIChatWithErrorBoundary() {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Something went wrong with the AI chat. Please refresh the page and try again.
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <AIChat />
    </ErrorBoundary>
  );
}

// In your AI component, handle specific error types gracefully:
function useAIWithErrorHandling() {
  const { sendChatMessage, error, clearError } = useShakespeare();

  const sendMessage = async (messages: ChatMessage[], modelId: string) => {
    try {
      await sendChatMessage(messages, modelId);
    } catch (err) {
      // Handle specific error types with user-friendly messages
      if (err.message.includes('401')) {
        throw new Error('Authentication failed. Please log in again.');
      } else if (err.message.includes('402')) {
        throw new Error('Insufficient credits. Please add credits to use premium features.');
      } else if (err.message.includes('network')) {
        throw new Error('Network error. Please check your internet connection.');
      }
      throw err; // Re-throw for error boundary
    }
  };

  return { sendMessage, error, clearError };
}
```
