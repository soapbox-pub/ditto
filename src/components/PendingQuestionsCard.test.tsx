import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PendingInput } from '@soapbox.pub/nostr-canvas/devkit';

import { TestApp } from '@/test/TestApp';
import { formatQuestionsAnswer, parseAskQuestionsData } from '@/lib/pendingInput';
import { PendingQuestionsCard } from './PendingQuestionsCard';

const QUESTIONS = [
  { text: 'What should the tile show?', suggestions: ['Clock', 'Weather'] },
  { text: 'What color?' },
];

function makePendingInput(questions: unknown = QUESTIONS): PendingInput {
  return {
    requestId: 'req-1',
    toolCallId: 'call-1',
    toolName: 'ask_questions',
    data: { questions },
  };
}

function renderCard(pendingInput: PendingInput, onAnswer: (answer: string) => void) {
  return render(
    <TestApp>
      <PendingQuestionsCard pendingInput={pendingInput} onAnswer={onAnswer} />
    </TestApp>,
  );
}

/** The card's free-text inputs share a placeholder; grab them by index. */
function answerInputs(): HTMLInputElement[] {
  return screen.getAllByPlaceholderText('Type your answer…') as HTMLInputElement[];
}

describe('PendingQuestionsCard', () => {
  it('renders the question text and suggestion chips', async () => {
    renderCard(makePendingInput(), vi.fn());

    // TestApp's providers settle asynchronously; wait for the first paint
    // before querying the rest of the DOM synchronously.
    expect(await screen.findByText('A few quick questions before I continue')).toBeInTheDocument();
    expect(screen.getByText('What should the tile show?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clock' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weather' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Custom…' })).toBeInTheDocument();
    // The suggestion-less question shows its plain text input.
    expect(answerInputs()).toHaveLength(1);
  });

  it('marks a clicked suggestion as selected', async () => {
    renderCard(makePendingInput(), vi.fn());

    const clock = await screen.findByRole('button', { name: 'Clock' });
    const custom = screen.getByRole('button', { name: 'Custom…' });
    expect(clock.className).not.toContain('border-primary');

    fireEvent.click(clock);

    expect(clock.className).toContain('border-primary');
    expect(custom.className).not.toContain('border-primary');
  });

  it('reveals a text field for a question when Custom is chosen', async () => {
    renderCard(makePendingInput(), vi.fn());

    // The suggestion-bearing question starts without a text field.
    await screen.findByRole('button', { name: 'Custom…' });
    expect(answerInputs()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Custom…' }));

    const inputs = answerInputs();
    expect(inputs).toHaveLength(2);
    // The revealed field belongs to the first question.
    fireEvent.change(inputs[0], { target: { value: 'A custom idea' } });
    expect(inputs[0]).toHaveValue('A custom idea');
  });

  it('keeps submit disabled until every question has a non-empty answer', async () => {
    renderCard(makePendingInput(), vi.fn());

    const submit = await screen.findByRole('button', { name: /submit answers/i });
    expect(submit).toBeDisabled();

    // Answering only the plain-text question is not enough.
    fireEvent.change(answerInputs()[0], { target: { value: 'Blue' } });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Weather' }));
    expect(submit).toBeEnabled();
  });

  it('submits formatQuestionsAnswer output through the answer callback', async () => {
    const onAnswer = vi.fn();
    renderCard(makePendingInput(), onAnswer);

    const clock = await screen.findByRole('button', { name: 'Clock' });
    fireEvent.click(clock);
    fireEvent.change(answerInputs()[0], { target: { value: '  Blue  ' } });
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }));

    const questions = parseAskQuestionsData(makePendingInput().data)!;
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(
      formatQuestionsAnswer(questions, ['Clock', 'Blue']),
    );
  });

  it('renders an inline error state for malformed pending input data', async () => {
    renderCard(makePendingInput({ nope: true }), vi.fn());

    expect(
      await screen.findByText(
        'This request could not be displayed. Please try sending your message again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit answers/i })).not.toBeInTheDocument();
  });
});
