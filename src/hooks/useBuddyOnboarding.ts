import { useState, useCallback, useMemo } from 'react';
import type { DisplayMessage } from '@/lib/aiChatTools';
import { useBuddy } from '@/hooks/useBuddy';

// ─── Types ────────────────────────────────────────────────────────────────────

type OnboardingStep = 'intro' | 'name' | 'soul' | 'confirm' | 'creating' | 'done';

// ─── Static Dork messages ─────────────────────────────────────────────────────

function dorkMessage(content: string, id: string): DisplayMessage {
  return { id, role: 'assistant', content, timestamp: new Date() };
}

const INTRO_MESSAGE = dorkMessage(
  `Hey there! I'm **Dork**, your friendly setup assistant.\n\nI'm here to help you create your very own AI buddy — a personal agent with its own Nostr identity and personality.\n\nOnce set up, your buddy will replace me as your chat companion here. Don't worry, I won't be offended. Probably.\n\nLet's get started! **What should we name your buddy?**`,
  'dork-intro',
);

const SOUL_PROMPT = dorkMessage(
  `Great name! Now for the fun part — **describe your buddy's soul.**\n\nThis is their personality: how they think, talk, and vibe. It gets injected into their brain every time you chat.\n\nA few examples to spark ideas:\n- *"A witty space explorer who explains everything with cosmic analogies"*\n- *"A chill surfer dude who's secretly a philosophy professor"*\n- *"A sarcastic librarian who knows everything but judges your taste"*\n\nWrite as much or as little as you want:`,
  'dork-soul-prompt',
);

function confirmMessage(name: string, soul: string): DisplayMessage {
  return dorkMessage(
    `Here's what we've got:\n\n**Name:** ${name}\n**Soul:** ${soul}\n\nLook good? Type **"yes"** to create your buddy, or **"no"** to start over.`,
    'dork-confirm',
  );
}

const CREATING_MESSAGE = dorkMessage(
  `Creating your buddy's Nostr identity... one moment! ✨`,
  'dork-creating',
);

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBuddyOnboarding() {
  const { createBuddy } = useBuddy();

  const [step, setStep] = useState<OnboardingStep>('intro');
  const [messages, setMessages] = useState<DisplayMessage[]>([INTRO_MESSAGE]);
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
          } catch (err) {
            console.error('Failed to create buddy:', err);
            setError('Failed to create buddy. Please try again.');
            setStep('soul');
            addDorkMessage(dorkMessage(
              `Hmm, something went wrong. Type **"yes"** to try again.`,
              `dork-error-${Date.now()}`,
            ));
          }
        } else if (lower === 'no' || lower === 'n' || lower === 'nope' || lower === 'start over' || lower === 'restart') {
          setBuddyName('');
          setBuddySoul('');
          setMessages([INTRO_MESSAGE]);
          setStep('intro');
        } else {
          addDorkMessage(dorkMessage(
            `Just type **"yes"** to confirm or **"no"** to start over.`,
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
