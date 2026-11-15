import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Plus, Edit, Trash2, Volume2, ArrowLeft, Sparkles, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import WordForm from '@/components/WordForm';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { VocabSet, Word, SortOption, mergeWordEdit } from '@/types/word';
import { toast } from 'sonner';
import { speakText } from '@/lib/speech';
import { categorizeWords } from '@/lib/categorize';
import { AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, type AIConfig } from '@/lib/ai';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const WordList = () => {
  const { setId } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const [vocabSets, setVocabSets] = useLocalStorage<VocabSet[]>('korean-vocab-sets', []);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('date');
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [aiConfig] = useLocalStorage<AIConfig>(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const currentSet = vocabSets.find(set => set.id === setId);

  const filteredWords = useMemo(() => {
    let words = [...(currentSet?.words ?? [])];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      words = words.filter(word =>
        word.korean.toLowerCase().includes(q) ||
        word.uzbek.toLowerCase().includes(q) ||
        (word.romanization || '').toLowerCase().includes(q)
      );
    }
    if (sortOption === 'alphabetical') {
      words.sort((a, b) => a.korean.localeCompare(b.korean));
    } else {
      words.sort((a, b) => b.createdAt - a.createdAt);
    }
    return words;
  }, [currentSet?.words, searchQuery, sortOption]);

  const hasCategories = currentSet?.words.some(w => w.category) ?? false;

  const groupedWords = useMemo(() => {
    if (!hasCategories) return null;
    const groups = new Map<string, Word[]>();
    for (const w of filteredWords) {
      const key = w.category || 'Uncategorized';
      const group = groups.get(key) ?? [];
      group.push(w);
      groups.set(key, group);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredWords, hasCategories]);

  if (!currentSet) {
    return (
      <div className="min-h-screen bg-background">
        <main className="container max-w-4xl mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Set not found</p>
          <Button onClick={() => navigate('/')} className="mt-4">Go Home</Button>
        </main>
      </div>
    );
  }

  const persistSet = (updated: VocabSet) => {
    setVocabSets(prev => prev.map(s => s.id === setId ? updated : s));
  };

  /** Update words relative to the latest stored deck, never a stale snapshot. */
  const updateWords = (fn: (words: Word[]) => Word[]) => {
    setVocabSets(prev => prev.map(s => s.id === setId ? { ...s, words: fn(s.words) } : s));
  };

  const startEditName = () => {
    setNameDraft(currentSet.name);
    setEditingName(true);
  };

  const commitName = () => {
    const name = nameDraft.trim();
    if (name && name !== currentSet.name) {
      persistSet({
        ...currentSet,
        name,
        words: currentSet.words.map(w => ({ ...w, set: name })),
      });
      toast.success('Deck renamed');
    }
    setEditingName(false);
  };

  const handleAddWord = (wordData: Omit<Word, 'id' | 'createdAt'>) => {
    const newWord: Word = { ...wordData, id: Date.now(), set: currentSet.name, createdAt: Date.now() };
    updateWords(words => [...words, newWord]);
    setShowForm(false);
    toast.success('Word added');
  };

  const handleUpdateWord = (wordData: Omit<Word, 'id' | 'createdAt'>) => {
    if (!editingWord) return;
    const updatedWord = mergeWordEdit(editingWord, wordData);
    updateWords(words => words.map(w => w.id === editingWord.id ? updatedWord : w));
    setEditingWord(null);
    toast.success('Word updated');
  };

  const handleDeleteWord = (wordId: number) => {
    updateWords(words => words.filter(w => w.id !== wordId));
    toast.success('Word deleted');
  };

  const handleCategorize = async () => {
    if (currentSet.words.length === 0) {
      toast.info('Add some words first');
      return;
    }
    if (!aiConfig.apiKey.trim()) {
      toast.error('Add your AI API key in Settings → AI Categorization');
      return;
    }
    setCategorizing(true);
    try {
      const payload = currentSet.words.map(w => ({ id: w.id, term: w.korean, translation: w.uzbek }));
      const assignments = await categorizeWords(aiConfig.provider, aiConfig.apiKey, aiConfig.model, payload);
      const map = new Map(assignments.map(a => [a.id, a.category]));
      const updated: VocabSet = {
        ...currentSet,
        words: currentSet.words.map(w => ({ ...w, category: map.get(w.id) || w.category || 'Uncategorized' })),
      };
      persistSet(updated);
      toast.success(`Categorized ${assignments.length} words`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to categorize');
    } finally {
      setCategorizing(false);
    }
  };

  const handleClearCategories = () => {
    updateWords(words => words.map(w => ({ ...w, category: undefined })));
    toast.success('Categories cleared');
  };

  const renderWordCard = (word: Word) => (
    <div key={word.id}>
      {editingWord?.id === word.id ? (
        <div className="p-5 bg-card rounded-2xl card-elev">
          <h2 className="text-lg font-semibold mb-4 text-center">Edit word</h2>
          <WordForm word={editingWord} onSave={handleUpdateWord} onCancel={() => setEditingWord(null)} />
        </div>
      ) : (
        <div className="bg-card rounded-2xl card-elev p-4 flex items-center gap-3">
          <Button variant="ghost" size="icon"
            onClick={() => void speakText(word.korean, { language: currentSet.language, onError: (msg) => toast.error(msg) })}
            aria-label="Pronounce"
            className="h-11 w-11 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
          >
            <Volume2 className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-xl font-semibold text-foreground truncate">{word.korean}</h3>
              {word.romanization && (
                <span className="px-2 py-0.5 rounded-full bg-muted text-[11px] text-muted-foreground truncate">{word.romanization}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{word.uzbek}</p>
            {word.example && <p className="text-xs text-muted-foreground/80 italic mt-1 line-clamp-2">{word.example}</p>}
          </div>
          <div className="flex shrink-0">
            <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setEditingWord(word)} aria-label="Edit">
              <Edit className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-destructive/15 hover:text-destructive" aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this word?</AlertDialogTitle>
                  <AlertDialogDescription>"{word.korean}" will be removed from this deck.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleDeleteWord(word.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <main className="container max-w-4xl mx-auto px-4 pt-5 pb-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to decks">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                {editingName ? (
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitName();
                      } else if (e.key === 'Escape') {
                        setEditingName(false);
                      }
                    }}
                    maxLength={100}
                    className="w-full border-0 bg-transparent text-2xl font-bold text-foreground outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={startEditName}
                    title="Rename deck"
                    className="group flex items-center gap-2 text-left"
                  >
                    <h1 className="text-2xl font-bold break-words">{currentSet.name}</h1>
                    <Edit className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                )}
                <p className="text-muted-foreground">{currentSet.words.length} words</p>
              </div>
            </div>
            <Button onClick={() => setShowForm(true)} className="btn-glow">
              <Plus className="mr-2 h-4 w-4" />
              Add Word
            </Button>
          </div>

          {showForm && !editingWord && (
            <div className="p-5 bg-card rounded-2xl card-elev">
              <h2 className="text-lg font-semibold mb-4 text-center">Add new word</h2>
              <WordForm onSave={handleAddWord} onCancel={() => setShowForm(false)} />
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search words..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary border-border"
              />
            </div>
            <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
              <SelectTrigger className="w-full sm:w-[180px] bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date Added</SelectItem>
                <SelectItem value="alphabetical">A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* AI Categorize */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleCategorize} disabled={categorizing || currentSet.words.length === 0} variant="outline" className="btn-glow">
              {categorizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {hasCategories ? 'Re-categorize with AI' : 'Categorize with AI'}
            </Button>
            {hasCategories && (
              <Button onClick={handleClearCategories} variant="ghost" size="sm">
                <XCircle className="mr-2 h-4 w-4" />
                Clear categories
              </Button>
            )}
          </div>

          {groupedWords ? (
            <div className="space-y-6">
              {groupedWords.map(([category, words]) => (
                <section key={category} className="space-y-3">
                  <h2 className="text-lg font-semibold text-primary border-b border-border pb-2">
                    {category} <span className="text-muted-foreground font-normal text-sm">({words.length})</span>
                  </h2>
                  <div className="space-y-3">{words.map(renderWordCard)}</div>
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-3">{filteredWords.map(renderWordCard)}</div>
          )}

          {filteredWords.length === 0 && (
            <div className="text-center text-muted-foreground p-12 bg-card border border-border rounded-xl">
              {searchQuery ? 'No words found matching your search' : 'No words in this set yet'}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default WordList;
