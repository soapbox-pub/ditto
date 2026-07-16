import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { ArrowLeft, GripVertical, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react';
import slugify from 'slugify';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { QUIZ_KIND } from '@/lib/quiz';
import { tryNaddrEncode } from '@/lib/safeNip19';
import { cn } from '@/lib/utils';

import type { QuizScoringMode } from '@/lib/quiz';

interface DimensionDraft {
  key: string;
  label: string;
}

interface OptionDraft {
  key: string;
  label: string;
  /** Dimension key → weight input value (string, may be empty). */
  weights: Record<string, string>;
}

interface QuestionDraft {
  key: string;
  text: string;
  options: OptionDraft[];
}

interface OutcomeDraft {
  key: string;
  label: string;
  description: string;
  /** HTTPS image URL shown with the result (optional). */
  image: string;
  /** ranges mode: single range condition over one dimension. */
  dimKey: string;
  min: string;
  max: string;
}

let draftCounter = 0;
function nextKey(): string {
  return `k${++draftCounter}`;
}

function newOption(): OptionDraft {
  return { key: nextKey(), label: '', weights: {} };
}

function newQuestion(): QuestionDraft {
  return { key: nextKey(), text: '', options: [newOption(), newOption()] };
}

/**
 * Quiz builder for kind 37849 (see NIP.md).
 *
 * The creator defines dimensions (scoring categories), questions whose
 * options add weights to those dimensions, and how totals map to outcomes
 * (argmax / ranges / raw scores). Publishing checks for d-tag collisions so
 * an existing quiz isn't silently overwritten.
 */
export function CreateQuizPage() {
  useLayoutOptions({ showFAB: false, hasSubHeader: true });

  const navigate = useNavigate();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const slugTouched = useRef(false);
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [scoring, setScoring] = useState<QuizScoringMode>('argmax');
  const [dimensions, setDimensions] = useState<DimensionDraft[]>([
    { key: nextKey(), label: '' },
    { key: nextKey(), label: '' },
  ]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion()]);
  /** argmax: outcome text per dimension key. */
  const [argmaxOutcomes, setArgmaxOutcomes] = useState<Record<string, { label: string; description: string; image: string }>>({});
  const [rangeOutcomes, setRangeOutcomes] = useState<OutcomeDraft[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);

  /** Published dimension ids, derived from labels (stable per current draft). */
  const dimIds = useMemo(() => {
    const ids = new Map<string, string>();
    const used = new Set<string>();
    dimensions.forEach((dim, i) => {
      let id = slugify(dim.label, { lower: true, strict: true }) || `d${i + 1}`;
      while (used.has(id)) id = `${id}-${i + 1}`;
      used.add(id);
      ids.set(dim.key, id);
    });
    return ids;
  }, [dimensions]);

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-muted-foreground">You must be logged in to create a quiz.</p>
      </div>
    );
  }

  const onTitleChange = (value: string) => {
    setTitle(value);
    if (!slugTouched.current) {
      setSlug(slugify(value, { lower: true, strict: true }));
    }
  };

  const uploadImage = async (file: File) => {
    try {
      const [[, url]] = await uploadFile(file);
      setImage(url);
    } catch {
      toast({ title: 'Image upload failed', variant: 'destructive' });
    }
  };

  const setWeight = (qKey: string, oKey: string, dimKey: string, value: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.key !== qKey ? q : {
          ...q,
          options: q.options.map((o) =>
            o.key !== oKey ? o : { ...o, weights: { ...o.weights, [dimKey]: value } }
          ),
        }
      )
    );
  };

  const validate = (): string | undefined => {
    if (!title.trim()) return 'Give your quiz a title.';
    if (!slug.trim()) return 'The quiz needs a URL slug.';
    if (dimensions.some((d) => !d.label.trim())) return 'Every dimension needs a name.';
    if (dimensions.length === 0) return 'Add at least one dimension.';
    if (questions.length === 0) return 'Add at least one question.';
    for (const [i, q] of questions.entries()) {
      if (!q.text.trim()) return `Question ${i + 1} needs text.`;
      if (q.options.length < 2) return `Question ${i + 1} needs at least two options.`;
      if (q.options.some((o) => !o.label.trim())) return `Every option in question ${i + 1} needs a label.`;
    }
    if (scoring === 'ranges') {
      if (rangeOutcomes.length === 0) return 'Add at least one result for range scoring.';
      for (const [i, o] of rangeOutcomes.entries()) {
        if (!o.label.trim()) return `Result ${i + 1} needs a label.`;
        if (!o.dimKey) return `Result ${i + 1} needs a dimension.`;
        if (o.min.trim() === '' && o.max.trim() === '') return `Result ${i + 1} needs a minimum or maximum score.`;
      }
    }
    return undefined;
  };

  const publish = async () => {
    const error = validate();
    if (error) {
      toast({ title: 'Not quite done', description: error, variant: 'destructive' });
      return;
    }

    setIsPublishing(true);
    try {
      // d-tag collision check: don't silently overwrite an existing quiz.
      try {
        const existing = await nostr.query(
          [{ kinds: [QUIZ_KIND], authors: [user.pubkey], '#d': [slug], limit: 1 }],
          { signal: AbortSignal.timeout(5000) },
        );
        if (existing.length > 0) {
          toast({
            title: 'Slug already in use',
            description: 'You already published a quiz with this slug. Pick a different one.',
            variant: 'destructive',
          });
          return;
        }
      } catch {
        // Relay timeout — proceed rather than blocking publishing entirely.
      }

      const tags: string[][] = [
        ['d', slug],
        ['title', title.trim()],
      ];
      if (summary.trim()) tags.push(['summary', summary.trim()]);
      if (image) tags.push(['image', image]);

      for (const dim of dimensions) {
        tags.push(['dimension', dimIds.get(dim.key)!, dim.label.trim()]);
      }

      questions.forEach((q, qi) => {
        const qId = `q${qi + 1}`;
        tags.push(['question', qId, q.text.trim()]);
        q.options.forEach((o, oi) => {
          const weightEntries = dimensions
            .map((dim) => {
              const raw = (o.weights[dim.key] ?? '').trim();
              const value = Number(raw);
              if (raw === '' || !Number.isFinite(value) || value === 0) return undefined;
              return `${dimIds.get(dim.key)!}:${value}`;
            })
            .filter((w): w is string => w !== undefined);
          tags.push(['option', qId, `o${oi + 1}`, o.label.trim(), ...weightEntries]);
        });
      });

      tags.push(['scoring', scoring]);

      if (scoring === 'argmax') {
        for (const dim of dimensions) {
          const outcome = argmaxOutcomes[dim.key];
          const id = dimIds.get(dim.key)!;
          const tag = ['outcome', id, outcome?.label.trim() || dim.label.trim(), outcome?.description.trim() ?? ''];
          if (outcome?.image.trim()) tag.push(outcome.image.trim());
          tags.push(tag);
        }
      } else if (scoring === 'ranges') {
        rangeOutcomes.forEach((o, i) => {
          const dimId = dimIds.get(o.dimKey)!;
          const min = o.min.trim();
          const max = o.max.trim();
          tags.push(['outcome', `r${i + 1}`, o.label.trim(), o.description.trim(), o.image.trim(), `${dimId}:${min}:${max}`]);
        });
      }

      tags.push(['alt', `Quiz: ${title.trim()}`]);

      await publishEvent({ kind: QUIZ_KIND, content: description.trim(), tags });

      toast({ title: 'Quiz published!' });
      const naddr = tryNaddrEncode({ kind: QUIZ_KIND, pubkey: user.pubkey, identifier: slug });
      navigate(naddr ? `/${naddr}` : '/quizzes');
    } catch {
      toast({ title: 'Failed to publish quiz', variant: 'destructive' });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-24">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to quizzes">
          <Link to="/quizzes"><ArrowLeft className="size-5" /></Link>
        </Button>
        <h1 className="text-xl font-bold">Create a quiz</h1>
      </div>

      {/* Basics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="quiz-title">Title</Label>
            <Input
              id="quiz-title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Which Element Are You?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-slug">Slug</Label>
            <Input
              id="quiz-slug"
              value={slug}
              onChange={(e) => {
                slugTouched.current = true;
                setSlug(slugify(e.target.value, { lower: true, strict: true, trim: false }));
              }}
              placeholder="which-element-are-you"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-summary">Summary</Label>
            <Input
              id="quiz-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One-line teaser shown on cards (optional)"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-description">Description</Label>
            <Textarea
              id="quiz-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Longer intro shown on the quiz page (optional)"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-image">Cover image</Label>
            <div className="flex items-center gap-2">
              <Input
                id="quiz-image"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://… (or upload)"
              />
              <Button asChild variant="outline" size="icon" aria-label="Upload cover image" disabled={isUploading}>
                <label className="cursor-pointer">
                  {isUploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadImage(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dimensions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dimensions</CardTitle>
          <p className="text-xs text-muted-foreground">
            The categories your quiz scores — houses, axes, or just "correct answers". Each answer option adds points to one or more dimensions.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {dimensions.map((dim, i) => (
            <div key={dim.key} className="flex items-center gap-2">
              <GripVertical className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
              <Input
                value={dim.label}
                onChange={(e) =>
                  setDimensions((prev) => prev.map((d) => d.key === dim.key ? { ...d, label: e.target.value } : d))}
                placeholder={`Dimension ${i + 1} (e.g. Gryffindor)`}
                aria-label={`Dimension ${i + 1} name`}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove dimension ${i + 1}`}
                disabled={dimensions.length <= 1}
                onClick={() => setDimensions((prev) => prev.filter((d) => d.key !== dim.key))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDimensions((prev) => [...prev, { key: nextKey(), label: '' }])}
          >
            <Plus className="size-4" />
            Add dimension
          </Button>
        </CardContent>
      </Card>

      {/* Questions */}
      {questions.map((question, qi) => (
        <Card key={question.key}>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Question {qi + 1}</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove question ${qi + 1}`}
              disabled={questions.length <= 1}
              onClick={() => setQuestions((prev) => prev.filter((q) => q.key !== question.key))}
            >
              <Trash2 className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={question.text}
              onChange={(e) =>
                setQuestions((prev) => prev.map((q) => q.key === question.key ? { ...q, text: e.target.value } : q))}
              placeholder="Ask something…"
              rows={2}
              aria-label={`Question ${qi + 1} text`}
            />

            <div className="space-y-3">
              {question.options.map((option, oi) => (
                <div key={option.key} className="rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={option.label}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((q) =>
                            q.key !== question.key ? q : {
                              ...q,
                              options: q.options.map((o) =>
                                o.key === option.key ? { ...o, label: e.target.value } : o
                              ),
                            }
                          )
                        )}
                      placeholder={`Option ${oi + 1}`}
                      aria-label={`Question ${qi + 1} option ${oi + 1} label`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove option ${oi + 1} from question ${qi + 1}`}
                      disabled={question.options.length <= 2}
                      onClick={() =>
                        setQuestions((prev) =>
                          prev.map((q) =>
                            q.key !== question.key ? q : { ...q, options: q.options.filter((o) => o.key !== option.key) }
                          )
                        )}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {dimensions.map((dim, di) => (
                      <div key={dim.key} className="space-y-0.5">
                        <Label
                          htmlFor={`w-${question.key}-${option.key}-${dim.key}`}
                          className="block truncate text-[11px] font-normal text-muted-foreground"
                        >
                          {dim.label.trim() || `Dimension ${di + 1}`}
                        </Label>
                        <Input
                          id={`w-${question.key}-${option.key}-${dim.key}`}
                          type="number"
                          step="any"
                          inputMode="decimal"
                          className="h-8"
                          value={option.weights[dim.key] ?? ''}
                          onChange={(e) => setWeight(question.key, option.key, dim.key, e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setQuestions((prev) =>
                  prev.map((q) => q.key === question.key ? { ...q, options: [...q.options, newOption()] } : q)
                )}
            >
              <Plus className="size-4" />
              Add option
            </Button>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline" className="w-full" onClick={() => setQuestions((prev) => [...prev, newQuestion()])}>
        <Plus className="size-4" />
        Add question
      </Button>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="quiz-scoring">How is the result decided?</Label>
            <Select value={scoring} onValueChange={(v) => setScoring(v as QuizScoringMode)}>
              <SelectTrigger id="quiz-scoring">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="argmax">Highest dimension wins (e.g. Sorting Hat)</SelectItem>
                <SelectItem value="ranges">Score ranges (e.g. trivia grades, axis poles)</SelectItem>
                <SelectItem value="scores">Just show the scores (e.g. Political Compass)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scoring === 'argmax' && (
            <div className="space-y-3">
              {dimensions.map((dim, di) => (
                <div key={dim.key} className="rounded-xl border p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    If {dim.label.trim() || `Dimension ${di + 1}`} wins…
                  </p>
                  <Input
                    className="mt-2"
                    value={argmaxOutcomes[dim.key]?.label ?? ''}
                    onChange={(e) =>
                      setArgmaxOutcomes((prev) => ({
                        ...prev,
                        [dim.key]: {
                          label: e.target.value,
                          description: prev[dim.key]?.description ?? '',
                          image: prev[dim.key]?.image ?? '',
                        },
                      }))}
                    placeholder={`Result title (defaults to "${dim.label.trim() || `Dimension ${di + 1}`}")`}
                    aria-label={`Result title when ${dim.label || `dimension ${di + 1}`} wins`}
                  />
                  <Textarea
                    className="mt-2"
                    value={argmaxOutcomes[dim.key]?.description ?? ''}
                    onChange={(e) =>
                      setArgmaxOutcomes((prev) => ({
                        ...prev,
                        [dim.key]: {
                          label: prev[dim.key]?.label ?? '',
                          description: e.target.value,
                          image: prev[dim.key]?.image ?? '',
                        },
                      }))}
                    placeholder="Result description (optional)"
                    rows={2}
                    aria-label={`Result description when ${dim.label || `dimension ${di + 1}`} wins`}
                  />
                  <OutcomeImageField
                    className="mt-2"
                    value={argmaxOutcomes[dim.key]?.image ?? ''}
                    onChange={(image) =>
                      setArgmaxOutcomes((prev) => ({
                        ...prev,
                        [dim.key]: {
                          label: prev[dim.key]?.label ?? '',
                          description: prev[dim.key]?.description ?? '',
                          image,
                        },
                      }))}
                    ariaLabel={`Result image when ${dim.label || `dimension ${di + 1}`} wins`}
                  />
                </div>
              ))}
            </div>
          )}

          {scoring === 'ranges' && (
            <div className="space-y-3">
              {rangeOutcomes.map((outcome, i) => (
                <div key={outcome.key} className="space-y-2 rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={outcome.label}
                      onChange={(e) =>
                        setRangeOutcomes((prev) =>
                          prev.map((o) => o.key === outcome.key ? { ...o, label: e.target.value } : o)
                        )}
                      placeholder={`Result ${i + 1} title`}
                      aria-label={`Result ${i + 1} title`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove result ${i + 1}`}
                      onClick={() => setRangeOutcomes((prev) => prev.filter((o) => o.key !== outcome.key))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-[1fr_5rem_5rem] items-end gap-2">
                    <div className="space-y-0.5">
                      <Label className="text-[11px] font-normal text-muted-foreground">Dimension</Label>
                      <Select
                        value={outcome.dimKey}
                        onValueChange={(v) =>
                          setRangeOutcomes((prev) => prev.map((o) => o.key === outcome.key ? { ...o, dimKey: v } : o))}
                      >
                        <SelectTrigger aria-label={`Result ${i + 1} dimension`}>
                          <SelectValue placeholder="Pick one" />
                        </SelectTrigger>
                        <SelectContent>
                          {dimensions.map((dim, di) => (
                            <SelectItem key={dim.key} value={dim.key}>
                              {dim.label.trim() || `Dimension ${di + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-0.5">
                      <Label htmlFor={`min-${outcome.key}`} className="text-[11px] font-normal text-muted-foreground">Min</Label>
                      <Input
                        id={`min-${outcome.key}`}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={outcome.min}
                        onChange={(e) =>
                          setRangeOutcomes((prev) =>
                            prev.map((o) => o.key === outcome.key ? { ...o, min: e.target.value } : o)
                          )}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label htmlFor={`max-${outcome.key}`} className="text-[11px] font-normal text-muted-foreground">Max</Label>
                      <Input
                        id={`max-${outcome.key}`}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={outcome.max}
                        onChange={(e) =>
                          setRangeOutcomes((prev) =>
                            prev.map((o) => o.key === outcome.key ? { ...o, max: e.target.value } : o)
                          )}
                      />
                    </div>
                  </div>
                  <Textarea
                    value={outcome.description}
                    onChange={(e) =>
                      setRangeOutcomes((prev) =>
                        prev.map((o) => o.key === outcome.key ? { ...o, description: e.target.value } : o)
                      )}
                    placeholder="Result description (optional)"
                    rows={2}
                    aria-label={`Result ${i + 1} description`}
                  />
                  <OutcomeImageField
                    value={outcome.image}
                    onChange={(image) =>
                      setRangeOutcomes((prev) =>
                        prev.map((o) => o.key === outcome.key ? { ...o, image } : o)
                      )}
                    ariaLabel={`Result ${i + 1} image`}
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setRangeOutcomes((prev) => [
                    ...prev,
                    { key: nextKey(), label: '', description: '', image: '', dimKey: dimensions[0]?.key ?? '', min: '', max: '' },
                  ])}
              >
                <Plus className="size-4" />
                Add result
              </Button>
              <p className="text-xs text-muted-foreground">
                Every result whose range matches the taker's score is shown. Leave min or max blank for "no limit".
              </p>
            </div>
          )}

          {scoring === 'scores' && (
            <p className="text-sm text-muted-foreground">
              Takers see their raw score for each dimension — no named results.
            </p>
          )}
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={publish} disabled={isPublishing}>
        {isPublishing && <Loader2 className="size-4 animate-spin" />}
        {isPublishing ? 'Publishing…' : 'Publish quiz'}
      </Button>
    </div>
  );
}

/** URL input + Blossom upload button for a result outcome image. */
function OutcomeImageField({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const { toast } = useToast();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();

  const upload = async (file: File) => {
    try {
      const [[, url]] = await uploadFile(file);
      onChange(url);
    } catch {
      toast({ title: 'Image upload failed', variant: 'destructive' });
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Result image URL (optional, or upload)"
        aria-label={ariaLabel}
      />
      <Button asChild variant="outline" size="icon" aria-label={`Upload: ${ariaLabel}`} disabled={isUploading}>
        <label className="cursor-pointer">
          {isUploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = '';
            }}
          />
        </label>
      </Button>
    </div>
  );
}
