import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  ChevronRight, Download, Upload, Trash2, FileJson, Moon,
  ArrowLeft, Database, AlertTriangle, Info, ClipboardPaste, Check, Bell, Sparkles, KeyRound, Plus,
} from 'lucide-react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useTheme, ACCENTS } from '@/components/ThemeProvider';
import { VocabSet, Word } from '@/types/word';
import { dayKey } from '@/lib/srs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Volume2 } from 'lucide-react';
import { AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, defaultModelFor, resolveModel, type AIProvider, type AIConfig } from '@/lib/ai';
import { getReminder, saveReminder, requestReminderPermission } from '@/lib/reminders';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const wordSchema = z.object({
  set: z.string().trim().max(100).optional(),
  korean: z.string().trim().min(1).max(200),
  uzbek: z.string().trim().min(1).max(200),
  romanization: z.string().trim().max(200).optional().default(''),
  example: z.string().trim().max(500).optional(),
  meaning: z.string().trim().max(200).optional(),
  category: z.string().trim().max(80).optional(),
});
const importSchema = z.array(wordSchema).min(1).max(500);

const vocabSetSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  language: z.string().optional(),
  words: z.array(z.object({
    id: z.number(),
    set: z.string().optional(),
    korean: z.string().min(1),
    uzbek: z.string().min(1),
    romanization: z.string().optional().default(''),
    meaning: z.string().optional(),
    example: z.string().optional(),
    category: z.string().optional(),
    createdAt: z.number(),
    isKnown: z.boolean().optional(),
  })),
  documents: z.array(z.any()).optional(),
  createdAt: z.number(),
});
const vocabSetsSchema = z.array(vocabSetSchema);

const Section = ({
  title, children, delay = 0, collapsible = false, defaultOpen = true,
}: {
  title?: string; children: React.ReactNode; delay?: number; collapsible?: boolean; defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const body = (
    <div className="bg-card rounded-2xl card-elev overflow-hidden divide-y divide-border/60">
      {children}
    </div>
  );
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="space-y-2"
    >
      {title && (collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full flex items-center justify-between px-4 text-left group"
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
            {title}
          </h2>
          <ChevronRight
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          />
        </button>
      ) : (
        <h2 className="px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
      ))}
      {collapsible ? (
        <motion.div
          initial={false}
          animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          {body}
        </motion.div>
      ) : body}
    </motion.section>
  );
};

const Row = ({
  icon, iconBg, title, subtitle, right, onClick, destructive,
}: {
  icon?: React.ReactNode;
  iconBg?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
}) => {
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left ${onClick ? 'hover:bg-muted/50 transition-colors' : ''}`}
    >
      {icon && (
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg || 'bg-primary/10 text-primary'}`}>
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${destructive ? 'text-destructive' : 'text-foreground'}`}>{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
      </div>
      {right ?? (onClick && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />)}
    </Tag>
  );
};

const Settings = () => {
  const navigate = useNavigate();
  const [vocabSets, setVocabSets] = useLocalStorage<VocabSet[]>('korean-vocab-sets', []);
  const { theme, setTheme, accent, setAccent } = useTheme();
  const [accentOpen, setAccentOpen] = useState(false);
  const currentAccent = ACCENTS.find((a) => a.key === accent) ?? ACCENTS[0];
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [dangerOpen, setDangerOpen] = useState(false);
  const [deleteDecks, setDeleteDecks] = useState(false);
  const [resetProgress, setResetProgress] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [reminder, setReminder] = useState(() => getReminder());
  const [autoVoice, setAutoVoice] = useLocalStorage<boolean>('ankor-auto-voice', false);
  const [aiConfig, setAIConfig] = useLocalStorage<AIConfig>(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG);

  // Migrate a stale (retired) Gemini model id saved from an older build.
  useEffect(() => {
    setAIConfig(prev => {
      const resolved = resolveModel(prev.provider, prev.model);
      return resolved === prev.model ? prev : { ...prev, model: resolved };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateAIConfig = (patch: Partial<AIConfig>) => setAIConfig(prev => ({ ...prev, ...patch }));

  const handleProviderChange = (provider: AIProvider) => {
    setAIConfig(prev => ({ provider, apiKey: prev.apiKey, model: defaultModelFor(provider) }));
  };

  /** Apply a reminder change against the latest state, then persist it. */
  const changeReminder = (fn: (r: typeof reminder) => typeof reminder) => {
    setReminder(prev => {
      const next = fn(prev);
      saveReminder(next);
      return next;
    });
  };

  const toggleReminder = async (v: boolean) => {
    if (v) {
      const ok = await requestReminderPermission();
      if (!ok) {
        toast.error('Enable notifications in your browser to use reminders');
        return;
      }
    }
    changeReminder(r => ({ ...r, enabled: v }));
    toast.success(v ? `Reminders on (${reminder.times.length})` : 'Reminders off');
  };

  const changeReminderTime = (index: number, time: string) =>
    changeReminder(r => ({ ...r, times: r.times.map((t, i) => (i === index ? time : t)) }));

  const addReminderTime = () =>
    changeReminder(r => ({ ...r, times: [...r.times, '20:00'] }));

  const removeReminderTime = (index: number) =>
    changeReminder(r => ({ ...r, times: r.times.filter((_, i) => i !== index) }));

  const totalCards = vocabSets.reduce((a, s) => a + (s.words?.length || 0), 0);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(vocabSets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocab-sets-${dayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Sets exported');
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const validated = vocabSetsSchema.parse(JSON.parse(e.target?.result as string)) as VocabSet[];
        setVocabSets(validated);
        toast.success('Sets imported');
      } catch (err) {
        if (err instanceof z.ZodError) toast.error(`Invalid: ${err.errors[0].message}`);
        else if (err instanceof SyntaxError) toast.error('Invalid JSON format');
        else toast.error('Error importing file');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleJsonImport = () => {
    try {
      const validated = importSchema.parse(JSON.parse(jsonInput));
      const setName = validated[0]?.set || `Vocab ${vocabSets.length + 1}`;
      const words = validated.map((item, i) => ({
        id: Date.now() + i,
        set: item.set || setName,
        korean: item.korean,
        uzbek: item.uzbek,
        romanization: item.romanization || '',
        meaning: item.meaning || item.uzbek,
        example: item.example || '',
        category: item.category,
        createdAt: Date.now(),
        isKnown: false,
      }));
      setVocabSets(prev => [...prev, { id: `set-${Date.now()}`, name: setName, words, createdAt: Date.now() }]);
      setJsonInput('');
      setJsonOpen(false);
      toast.success(`Imported ${words.length} words`);
    } catch (err) {
      if (err instanceof z.ZodError) toast.error(`Invalid: ${err.errors[0].message}`);
      else if (err instanceof SyntaxError) toast.error('Invalid JSON format');
      else toast.error('Error processing data');
    }
  };

  const handleClearData = () => {
    if (!deleteDecks && !resetProgress) return;
    // Deleting decks subsumes resetting progress: with no cards left there is
    // no scheduling state to preserve, so clear both stores in either case.
    if (deleteDecks) {
      setVocabSets([]);
    } else {
      setVocabSets(prev => prev.map(s => ({
        ...s,
        words: s.words.map(w => ({
          ...w,
          interval: undefined,
          ease: undefined,
          due: undefined,
          lapses: undefined,
          state: undefined,
          isKnown: false,
        })),
      })));
    }
    try {
      localStorage.removeItem('known-words');
      localStorage.removeItem('study-sessions');
    } catch { /* ignore */ }
    setDangerOpen(false);
    setDeleteDecks(false);
    setResetProgress(false);
    toast.success(
      deleteDecks && resetProgress
        ? 'Decks and progress cleared'
        : deleteDecks
          ? 'All decks deleted'
          : 'Learning progress reset',
    );
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <header className="sticky top-0 z-30">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -bottom-10 bg-background/30 backdrop-blur-[10px] [mask-image:linear-gradient(to_bottom,black_45%,transparent)]" />
        <div
          className="relative container max-w-2xl mx-auto px-4 py-4 flex items-center gap-2"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
        >
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Settings</h1>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto px-4 pt-2 space-y-6">
        <Section title="Appearance" delay={0}>
          <Row
            icon={<Moon className="h-4 w-4" />}
            iconBg="bg-primary/10 text-primary"
            title="Dark Mode"
            subtitle="Use a dark color palette"
            right={
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
              />
            }
          />
          <div>
            <button
              type="button"
              onClick={() => setAccentOpen((o) => !o)}
              aria-expanded={accentOpen}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: currentAccent.hex }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">Accent color</div>
                <div className="text-xs text-muted-foreground truncate">{currentAccent.name} · tap to change</div>
              </div>
              <ChevronRight
                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${accentOpen ? 'rotate-90' : ''}`}
              />
            </button>
            <motion.div
              initial={false}
              animate={{ height: accentOpen ? 'auto' : 0, opacity: accentOpen ? 1 : 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="mx-auto grid grid-cols-10 gap-1.5 px-4 pb-5 pt-1 sm:gap-3">
                {ACCENTS.map((a) => {
                  const selected = accent === a.key;
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => setAccent(a.key)}
                      aria-label={a.name}
                      aria-pressed={selected}
                      className="flex items-center justify-center"
                    >
                      <span
                        className={`flex aspect-square w-full max-w-[2.25rem] items-center justify-center rounded-full transition-opacity ${
                          selected ? 'ring-2 ring-inset ring-white/80' : 'hover:opacity-90'
                        }`}
                        style={{ backgroundColor: a.hex }}
                      >
                        {selected && (
                          <Check className="h-3 w-3 text-white drop-shadow sm:h-4 sm:w-4" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </Section>

        <Section title="Reminders" delay={0.03} collapsible defaultOpen={false}>
          <Row
            icon={<Bell className="h-4 w-4" />}
            iconBg="bg-primary/10 text-primary"
            title="Daily reminder"
            subtitle="Get a notification to review your cards"
            right={
              <Switch
                checked={reminder.enabled}
                onCheckedChange={toggleReminder}
              />
            }
          />
          {reminder.enabled && (
            <>
              {reminder.times.map((time, i) => (
                <div key={i} className="flex items-center gap-2.5 px-4 py-2">
                  <Bell className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium text-foreground">Reminder {i + 1}</span>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => changeReminderTime(i, e.target.value)}
                    className="bg-muted text-foreground text-sm rounded-lg px-2 py-1 outline-none"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeReminderTime(i)}
                    aria-label={`Delete reminder ${i + 1}`}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <button
                type="button"
                onClick={addReminderTime}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-muted/40"
              >
                <Plus className="h-4 w-4" /> Add reminder
              </button>
            </>
          )}
        </Section>


        <Section title="Study" delay={0.04}>
          <Row
            icon={<Volume2 className="h-4 w-4" />}
            iconBg="bg-primary/10 text-primary"
            title="Auto voice"
            subtitle="Read each word aloud when it appears"
            right={<Switch checked={autoVoice} onCheckedChange={setAutoVoice} />}
          />
        </Section>

        <Section title="AI Categorization" delay={0.045} collapsible defaultOpen={false}>
          <div className="px-4 py-4 space-y-4">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <span>Auto-group your words with a free API key from Google AI Studio or Groq Cloud.</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-provider" className="text-xs text-muted-foreground">Provider</Label>
              <Select value={aiConfig.provider} onValueChange={(v) => handleProviderChange(v as AIProvider)}>
                <SelectTrigger id="ai-provider" className="w-full h-11 rounded-xl bg-muted/60 border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="gemini" className="rounded-lg">Google Gemini (free)</SelectItem>
                  <SelectItem value="groq" className="rounded-lg">Groq (free)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-key" className="text-xs text-muted-foreground">API key</Label>
              <Input
                id="ai-key"
                type="password"
                value={aiConfig.apiKey}
                onChange={(e) => updateAIConfig({ apiKey: e.target.value })}
                placeholder="Paste your API key"
                className="h-11 rounded-xl bg-muted/60 border-0"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <KeyRound className="h-3 w-3" /> Stored only in this browser
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-model" className="text-xs text-muted-foreground">Model</Label>
              <Input
                id="ai-model"
                value={aiConfig.model}
                onChange={(e) => updateAIConfig({ model: e.target.value })}
                placeholder="model id"
                className="h-11 rounded-xl bg-muted/60 border-0 font-mono text-sm"
              />
            </div>
          </div>
        </Section>

        <Section title="Data" delay={0.05}>
          <Row
            icon={<ClipboardPaste className="h-4 w-4" />}
            iconBg="bg-primary/10 text-primary"
            title="Paste JSON"
            subtitle="Quickly import words from clipboard"
            onClick={() => setJsonOpen(true)}
          />
          <Row
            icon={<Download className="h-4 w-4" />}
            iconBg="bg-studied/20 text-studied"
            title="Export sets"
            subtitle={`${vocabSets.length} deck${vocabSets.length === 1 ? '' : 's'} · ${totalCards} cards`}
            onClick={handleExport}
          />
          <Row
            icon={<Upload className="h-4 w-4" />}
            iconBg="bg-badge-review text-badge-review-foreground"
            title="Import from file"
            subtitle="Restore from a JSON backup"
            onClick={() => fileRef.current?.click()}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
        </Section>

        <Section title="About" delay={0.1}>
          <Row
            icon={<Info className="h-4 w-4" />}
            iconBg="bg-muted text-muted-foreground"
            title="AnKor"
            subtitle="Spaced repetition · v1.0"
          />
          <Row
            icon={<Database className="h-4 w-4" />}
            iconBg="bg-muted text-muted-foreground"
            title="Storage"
            subtitle={`${vocabSets.length} decks · ${totalCards} cards stored locally`}
          />
        </Section>

        <Section title="Danger Zone" delay={0.15}>
          <button
            type="button"
            onClick={() => setDangerOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
              <Trash2 className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-destructive">Clear data</div>
              <div className="text-xs text-muted-foreground">Delete decks, reset progress, or both</div>
            </div>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </button>
        </Section>
      </main>

      <Dialog open={dangerOpen} onOpenChange={setDangerOpen}>
        <DialogContent className="bg-card max-w-md">
          <DialogHeader>
            <DialogTitle>Clear data</DialogTitle>
            <DialogDescription>
              Choose what to remove. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-3 rounded-xl border border-border p-3">
              <Checkbox
                id="danger-decks"
                checked={deleteDecks}
                onCheckedChange={(v) => setDeleteDecks(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="danger-decks" className="flex-1 cursor-pointer">
                <div className="text-sm font-medium text-foreground">Delete all decks</div>
                <div className="text-xs text-muted-foreground">Removes every deck and its cards.</div>
              </label>
            </div>
            <div className={`flex items-start gap-3 rounded-xl border border-border p-3 ${deleteDecks ? 'opacity-50' : ''}`}>
              <Checkbox
                id="danger-progress"
                checked={resetProgress || deleteDecks}
                disabled={deleteDecks}
                onCheckedChange={(v) => setResetProgress(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="danger-progress" className={`flex-1 ${deleteDecks ? '' : 'cursor-pointer'}`}>
                <div className="text-sm font-medium text-foreground">Reset learning progress</div>
                <div className="text-xs text-muted-foreground">
                  {deleteDecks
                    ? 'Included automatically when decks are deleted.'
                    : 'Keeps your cards but clears review scheduling, known words, and study history.'}
                </div>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="bg-muted hover:bg-accent" onClick={() => setDangerOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deleteDecks && !resetProgress}
              onClick={handleClearData}
            >
              {deleteDecks && resetProgress
                ? 'Delete & reset'
                : deleteDecks
                  ? 'Delete decks'
                  : resetProgress
                    ? 'Reset progress'
                    : 'Clear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={jsonOpen} onOpenChange={setJsonOpen}>
        <DialogContent className="bg-card max-w-lg">
          <DialogHeader>
            <DialogTitle>Paste JSON</DialogTitle>
            <DialogDescription>Array of words to import as a new deck</DialogDescription>
          </DialogHeader>
          <Textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={`[
  {
    "korean": "안녕하세요",
    "uzbek": "Salom",
    "romanization": "annyeonghaseyo",
    "example": "안녕하세요, 만나서 반갑습니다."
  },
  {
    "korean": "감사합니다",
    "uzbek": "Rahmat",
    "romanization": "gamsahamnida"
  }
]`}
            className="min-h-[160px] font-mono text-sm rounded-2xl bg-muted/60 border-0 resize-none focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
          />
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Required: <code className="text-foreground">korean</code> (term) · <code className="text-foreground">uzbek</code> (translation).
            Optional: <code className="text-foreground">romanization</code> (pronunciation) · <code className="text-foreground">example</code> · <code className="text-foreground">set</code> (deck name).
          </p>
          <DialogFooter>
            <Button variant="ghost" className="bg-muted hover:bg-accent" onClick={() => setJsonOpen(false)}>Cancel</Button>
            <Button onClick={handleJsonImport} disabled={!jsonInput.trim()}>
              <FileJson className="h-4 w-4 mr-2" /> Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Settings;
