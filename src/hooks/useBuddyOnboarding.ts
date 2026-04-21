import { useState, useCallback, useMemo } from 'react';
import type { DisplayMessage } from '@/lib/aiChatTools';
import { useBuddy } from '@/hooks/useBuddy';

// ─── Types ────────────────────────────────────────────────────────────────────

type OnboardingStep = 'intro' | 'name' | 'soul' | 'confirm' | 'creating' | 'done';

// ─── Static Dork messages (short + whimsical) ────────────────────────────────

function dorkMessage(content: string, id: string): DisplayMessage {
  return { id, role: 'assistant', content, timestamp: new Date() };
}

const NAME_PROMPT = dorkMessage(
  `First things first — **what should we call your buddy?**`,
  'dork-name-prompt',
);

const SOUL_PROMPT = dorkMessage(
  `Love it. Now the fun part — **describe their soul.**\n\nThis is how they think, talk, and vibe. A few sparks:\n- *"A witty space explorer who explains everything with cosmic analogies"*\n- *"A chill surfer who's secretly a philosophy professor"*\n- *"A sarcastic librarian who judges your taste"*`,
  'dork-soul-prompt',
);

function confirmMessage(name: string, soul: string): DisplayMessage {
  return dorkMessage(
    `Here's the blueprint:\n\n**Name:** ${name}\n**Soul:** ${soul}\n\nLooking good? **"yes"** to bring them to life, **"no"** to start over.`,
    'dork-confirm',
  );
}

const CREATING_MESSAGE = dorkMessage(
  `Spinning up their Nostr identity... one sec!`,
  'dork-creating',
);

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBuddyOnboarding() {
  const { createBuddy } = useBuddy();

  const [step, setStep] = useState<OnboardingStep>('intro');
  const [messages, setMessages] = useState<DisplayMessage[]>([NAME_PROMPT]);
  const [buddyName, setBuddyName] = useState('');
  const [buddySoul, setBuddySoul] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addUserMessage = useCallback((content: string) => {
    const msg: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  const addDorkMessage = useCallback((msg: DisplayMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleSend = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setError(null);

    switch (step) {
      case 'intro': {
        // User provided a name
        addUserMessage(trimmed);
        setBuddyName(trimmed);
        addDorkMessage(SOUL_PROMPT);
        setStep('name');
        break;
      }

      case 'name': {
        // User provided soul description
        addUserMessage(trimmed);
        setBuddySoul(trimmed);
        addDorkMessage(confirmMessage(buddyName, trimmed));
        setStep('soul');
        break;
      }

      case 'soul': {
        // User confirms or restarts
        addUserMessage(trimmed);
        const lower = trimmed.toLowerCase();

        if (lower === 'yes' || lower === 'y' || lower === 'yep' || lower === 'looks good' || lower === 'confirm') {
          setStep('creating');
          addDorkMessage(CREATING_MESSAGE);

          try {
            await createBuddy.mutateAsync({ name: buddyName, soul: buddySoul });
            setStep('done');
          } catch {
            setError('Failed to create buddy. Please try again.');
            setStep('soul');
            addDorkMessage(dorkMessage(
              `Hmm, something glitched. Type **"yes"** to try again.`,
              `dork-error-${Date.now()}`,
            ));
          }
        } else if (lower === 'no' || lower === 'n' || lower === 'nope' || lower === 'start over' || lower === 'restart') {
          setBuddyName('');
          setBuddySoul('');
          setMessages([NAME_PROMPT]);
          setStep('intro');
        } else {
          addDorkMessage(dorkMessage(
            `Just **"yes"** to confirm or **"no"** to start over.`,
            `dork-clarify-${Date.now()}`,
          ));
        }
        break;
      }

      default:
        break;
    }
  }, [step, buddyName, buddySoul, addUserMessage, addDorkMessage, createBuddy]);

  const isCreating = step === 'creating';
  const isDone = step === 'done';

  const placeholder = useMemo(() => {
    switch (step) {
      case 'intro': return 'Type a name...';
      case 'name': return 'Describe their personality...';
      case 'soul': return 'yes / no';
      case 'creating': return 'Creating...';
      default: return '';
    }
  }, [step]);

  return {
    messages,
    handleSend,
    isCreating,
    isDone,
    placeholder,
    error,
  };
}
