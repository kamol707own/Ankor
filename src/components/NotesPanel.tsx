import { useEffect, useRef, useState } from 'react';
import {
  X, Plus, Trash2, Pencil, Bold, Italic, Strikethrough, Underline as UnderlineIcon,
  Heading1, Heading2, List, ListOrdered, Quote, Code2, ArrowLeft, NotebookPen,
  Undo2, Redo2, Palette, Type, Minus, MoreVertical, Save, FileUp,
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Document } from '@/types/word';
import { toast } from 'sonner';

interface NotesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type View = 'list' | 'read' | 'edit';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#111827'];

const FONTS = [
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Sans', value: 'Inter, system-ui, sans-serif' },
  { label: 'Mono', value: 'JetBrains Mono, monospace' },
  { label: 'Cursive', value: 'cursive' },
  { label: 'Times', value: '"Times New Roman", serif' },
];

const snippet = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

/** Existing notes were stored as Markdown; convert once to HTML for the rich editor. */
const toHtml = (raw: string) => {
  if (!raw) return '';
  if (/^\s*<[a-z][\s\S]*>/i.test(raw)) return raw; // already HTML
  try {
    return marked.parse(raw, { async: false }) as string;
  } catch {
    return raw.replace(/\n/g, '<br>');
  }
};

const ToolButton = ({
  onClick, title, active, children,
}: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    title={title}
    aria-label={title}
    className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
      active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`}
  >
    {children}
  </button>
);

const Sep = () => <span className="mx-1 h-5 w-px bg-border/70" />;

const ColorPicker = ({ onPick }: { onPick: (color: string) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        title="Text color"
        aria-label="Text color"
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Palette className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[81] mt-1 grid w-[160px] grid-cols-5 gap-1.5 rounded-lg border border-border bg-popover p-2 shadow-xl">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
                aria-label={`Color ${c}`}
                className="h-6 w-6 rounded-full border border-border"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const FontPicker = ({ onPick }: { onPick: (family: string) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        title="Font"
        aria-label="Font"
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Type className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[81] mt-1 w-44 rounded-lg border border-border bg-popover p-1 shadow-xl">
            {FONTS.map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => {
                  onPick(f.value);
                  setOpen(false);
                }}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                style={{ fontFamily: f.value }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const NoteCard = ({
  note, onOpen, onActions,
}: { note: Document; onOpen: (n: Document) => void; onActions: (n: Document) => void }) => (
  <div className="group flex items-start gap-2 rounded-xl border border-border bg-card/70 p-3 transition-colors hover:border-primary/40 hover:bg-card">
    <button onClick={() => onOpen(note)} className="min-w-0 flex-1 text-left">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-semibold text-foreground">{note.title || 'Untitled'}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {new Date(note.updatedAt).toLocaleDateString()}
        </span>
      </div>
      {note.content && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{snippet(note.content)}</p>
      )}
    </button>
    <button
      onClick={(e) => {
        e.stopPropagation();
        onActions(note);
      }}
      aria-label="Note actions"
      title="Edit or delete"
      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <MoreVertical className="h-4 w-4" />
    </button>
  </div>
);

const NotesPanel = ({ open, onOpenChange }: NotesPanelProps) => {
  const [notes, setNotes] = useLocalStorage<Document[]>('my-documents', []);
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(''); // read-view HTML
  const [actionNote, setActionNote] = useState<Document | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const contentRef = useRef('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontFamily,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[50vh] focus:outline-none',
      },
    },
    onUpdate: ({ editor: ed }) => {
      contentRef.current = ed.getHTML();
    },
  });

  // Load the selected note into the editor when entering edit mode.
  useEffect(() => {
    if (view === 'edit' && editor) {
      editor.commands.setContent(contentRef.current || '<p></p>');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId, editor]);

  if (!open) return null;

  const openRead = (n: Document) => {
    setSelectedId(n.id);
    setTitle(n.title);
    setContent(toHtml(n.content));
    setActionNote(null);
    setConfirmDelete(false);
    setView('read');
  };

  const openEdit = (n: Document) => {
    const html = toHtml(n.content);
    setSelectedId(n.id);
    setTitle(n.title);
    setContent(html);
    contentRef.current = html;
    setActionNote(null);
    setConfirmDelete(false);
    setView('edit');
  };

  const newNote = () => {
    setSelectedId(null);
    setTitle('');
    setContent('');
    contentRef.current = '';
    setActionNote(null);
    setConfirmDelete(false);
    setView('edit');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const html = toHtml(text);
      const now = Date.now();
      const doc: Document = {
        id: crypto.randomUUID(),
        title: file.name.replace(/\.[^.]+$/, '') || 'Imported note',
        content: html,
        createdAt: now,
        updatedAt: now,
      };
      setNotes([...notes, doc]);
      openEdit(doc);
      toast.success(`Imported "${doc.title}"`);
    } catch {
      toast.error('Could not import that file');
    }
  };

  const persist = (html: string): string | null => {
    if (!title.trim()) return selectedId;
    const now = Date.now();
    if (selectedId) {
      setNotes(notes.map(n => (n.id === selectedId ? { ...n, title: title.trim(), content: html, updatedAt: now } : n)));
      return selectedId;
    }
    const id = crypto.randomUUID();
    setNotes([...notes, { id, title: title.trim(), content: html, createdAt: now, updatedAt: now }]);
    setSelectedId(id);
    return id;
  };

  const currentHtml = () => editor?.getHTML() ?? contentRef.current;

  const saveNow = () => {
    const id = persist(currentHtml());
    setContent(currentHtml());
    toast.success(id ? 'Saved' : 'Give your note a title first');
  };

  const backToList = () => {
    persist(currentHtml());
    setView('list');
  };

  const deleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setTitle('');
      setContent('');
    }
    setActionNote(null);
    setConfirmDelete(false);
    toast.success('Note deleted');
  };

  const closeSheet = () => {
    setActionNote(null);
    setConfirmDelete(false);
  };

  const sortedNotes = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {view === 'list' && (
        <>
          <header className="shrink-0 border-b border-border">
            <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close notes">
                <X className="h-5 w-5" />
              </Button>
              <h2 className="flex-1 text-lg font-semibold">Notes</h2>
              <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} aria-label="Import Markdown note" title="Import .md">
                <FileUp className="h-5 w-5" />
              </Button>
              <Button size="icon" onClick={newNote} aria-label="New note" title="New note">
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </header>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            onChange={handleImportFile}
            className="hidden"
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl space-y-2 p-3">
              {sortedNotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <NotebookPen className="h-7 w-7" />
                  </div>
                  <p className="text-sm text-muted-foreground">No notes yet</p>
                  <Button onClick={newNote}>
                    <Plus className="h-4 w-4" /> Create a note
                  </Button>
                </div>
              ) : (
                sortedNotes.map(n => <NoteCard key={n.id} note={n} onOpen={openRead} onActions={setActionNote} />)
              )}
            </div>
          </div>
        </>
      )}

      {view === 'read' && (
        <>
          <header className="shrink-0 border-b border-border">
            <div className="mx-auto flex max-w-3xl items-center gap-1 px-3 py-2.5">
              <Button variant="ghost" size="icon" onClick={() => setView('list')} aria-label="Back to notes">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-muted-foreground">
                {title || 'Untitled'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  contentRef.current = content;
                  setView('edit');
                }}
                aria-label="Edit note"
                title="Edit"
              >
                <Pencil className="h-5 w-5" />
              </Button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <article
              className="prose prose-sm dark:prose-invert mx-auto max-w-3xl px-5 py-6"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
            />
          </div>
        </>
      )}

      {view === 'edit' && (
        <>
          <header className="shrink-0 border-b border-border">
            <div className="mx-auto flex max-w-3xl items-center gap-1 px-3 py-2">
              <Button variant="ghost" size="icon" onClick={backToList} aria-label="Back to notes">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-muted-foreground">
                {title || 'Untitled'}
              </span>
              <Button variant="ghost" size="icon" onClick={saveNow} aria-label="Save note" title="Save">
                <Save className="h-5 w-5" />
              </Button>
            </div>
          </header>

          <div className="shrink-0">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-0.5 px-2 pb-1.5 text-muted-foreground sm:px-4">
              <ToolButton onClick={() => editor?.chain().focus().undo().run()} title="Undo (Ctrl+Z)"><Undo2 className="h-4 w-4" /></ToolButton>
              <ToolButton onClick={() => editor?.chain().focus().redo().run()} title="Redo (Ctrl+Y)"><Redo2 className="h-4 w-4" /></ToolButton>
              <Sep />
              <ToolButton onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1" active={editor?.isActive('heading', { level: 1 })}><Heading1 className="h-4 w-4" /></ToolButton>
              <ToolButton onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2" active={editor?.isActive('heading', { level: 2 })}><Heading2 className="h-4 w-4" /></ToolButton>
              <Sep />
              <ToolButton onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold" active={editor?.isActive('bold')}><Bold className="h-4 w-4" /></ToolButton>
              <ToolButton onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic" active={editor?.isActive('italic')}><Italic className="h-4 w-4" /></ToolButton>
              <ToolButton onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline" active={editor?.isActive('underline')}><UnderlineIcon className="h-4 w-4" /></ToolButton>
              <ToolButton onClick={() => editor?.chain().focus().toggleStrike().run()} title="Strikethrough" active={editor?.isActive('strike')}><Strikethrough className="h-4 w-4" /></ToolButton>
              <ToolButton onClick={() => editor?.chain().focus().toggleCode().run()} title="Inline code" active={editor?.isActive('code')}><Code2 className="h-4 w-4" /></ToolButton>
              <Sep />
              <ToolButton onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet list" active={editor?.isActive('bulletList')}><List className="h-4 w-4" /></ToolButton>
              <ToolButton onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered list" active={editor?.isActive('orderedList')}><ListOrdered className="h-4 w-4" /></ToolButton>
              <ToolButton onClick={() => editor?.chain().focus().toggleBlockquote().run()} title="Quote" active={editor?.isActive('blockquote')}><Quote className="h-4 w-4" /></ToolButton>
              <Sep />
              <ColorPicker onPick={(color) => editor?.chain().focus().setColor(color).run()} />
              <FontPicker onPick={(family) => editor?.chain().focus().setFontFamily(family).run()} />
              <Sep />
              <ToolButton onClick={() => editor?.chain().focus().setHorizontalRule().run()} title="Divider"><Minus className="h-4 w-4" /></ToolButton>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-5 pb-24 pt-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled"
                spellCheck={false}
                className="mb-3 w-full border-0 bg-transparent text-2xl font-bold text-foreground outline-none placeholder:text-muted-foreground/40"
              />
              <EditorContent editor={editor} />
            </div>
          </div>
        </>
      )}

      {/* In-panel action sheet (above the panel) */}
      {actionNote && (
        <div
          className="absolute inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center"
          onClick={closeSheet}
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {confirmDelete ? (
              <>
                <div className="px-3 py-2">
                  <h3 className="text-base font-semibold">Delete note?</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    "{actionNote.title || 'Untitled'}" will be permanently deleted. This cannot be undone.
                  </p>
                </div>
                <div className="flex gap-2 p-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  <Button
                    className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteNote(actionNote.id)}
                  >
                    Delete
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-semibold text-foreground">{actionNote.title || 'Untitled'}</p>
                </div>
                <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => openEdit(actionNote)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesPanel;
