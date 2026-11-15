import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home as HomeIcon, Search as SearchIcon, BarChart3, Settings as SettingsIcon,
  Plus, FolderPlus, FilePlus2, Download,
} from 'lucide-react';
import CreateSetDialog from '@/components/CreateSetDialog';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { VocabSet } from '@/types/word';
import { toast } from 'sonner';

type Tab = 'home' | 'browser' | 'insights' | 'settings';

interface BottomNavProps {
  active: Tab;
}

/**
 * The bar sits *on* the app surface rather than floating over it: the content
 * scrolls underneath a soft gradient of the same background colour, so there is
 * no visible seam between content and navigation.
 */
const BottomNav = ({ active }: BottomNavProps) => {
  const navigate = useNavigate();
  const [fabOpen, setFabOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [vocabSets, setVocabSets] = useLocalStorage<VocabSet[]>('korean-vocab-sets', []);

  const goToSection = (path: string) => {
    setFabOpen(false);
    navigate(path);
  };

  const handleCreateSet = (name: string, language?: string) => {
    const newSet: VocabSet = { id: Date.now().toString(), name, words: [], language, createdAt: Date.now() };
    setVocabSets(prev => [...prev, newSet]);
    toast.success(`${name} created`);
    setTimeout(() => navigate(`/words/${newSet.id}`), 100);
  };

  return (
    <>
      <CreateSetDialog open={showCreate} onOpenChange={setShowCreate} onCreateSet={handleCreateSet} />

      {/* Action sheet overlay */}
      <AnimatePresence>
        {fabOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-end justify-center bg-background/60 backdrop-blur-sm"
            onClick={() => setFabOpen(false)}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
          >
            <motion.div
              initial={{ y: 16, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 16, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="w-60 rounded-2xl border border-border bg-card p-2 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <MenuRow icon={<Download className="h-5 w-5" />} label="Get shared decks"
                onClick={() => { setFabOpen(false); navigate('/settings'); }} />
              <MenuRow icon={<FolderPlus className="h-5 w-5" />} label="Create deck"
                onClick={() => { setFabOpen(false); setShowCreate(true); }} />
              <MenuRow icon={<FilePlus2 className="h-5 w-5" />} label="Create card"
                onClick={() => {
                  setFabOpen(false);
                  if (vocabSets[0]) navigate(`/words/${vocabSets[0].id}`);
                  else toast.info('Create a deck first');
                }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        Fixed to the viewport but flush with the app background — no border, no
        card, no shadow, no side gutters. The only separation is a short gradient
        above it so content dissolving underneath stays legible.
      */}
      <div className="fixed inset-x-0 bottom-0 z-50">
        <div
          aria-hidden
          className="app-nav-fade pointer-events-none absolute inset-x-0 bottom-full h-14"
        />
        <nav
          aria-label="Primary"
          className="bg-background"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto flex h-16 max-w-2xl items-center justify-around px-2">
            <NavItem icon={<HomeIcon className="h-5 w-5" />} label="Home" active={active === 'home'} onClick={() => goToSection('/')} />
            <NavItem icon={<SearchIcon className="h-5 w-5" />} label="Browse" active={active === 'browser'} onClick={() => goToSection('/browser')} />

            <button
              onClick={() => setFabOpen(o => !o)}
              className="mx-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform active:scale-90"
              aria-label={fabOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={fabOpen}
            >
              <motion.span
                animate={{ rotate: fabOpen ? 45 : 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="flex items-center justify-center"
              >
                <Plus className="h-6 w-6" strokeWidth={2.5} />
              </motion.span>
            </button>

            <NavItem icon={<BarChart3 className="h-5 w-5" />} label="Insights" active={active === 'insights'} onClick={() => goToSection('/insights')} />
            <NavItem icon={<SettingsIcon className="h-5 w-5" />} label="Settings" active={active === 'settings'} onClick={() => goToSection('/settings')} />
          </div>
        </nav>
      </div>
    </>
  );
};

const NavItem = ({
  icon, label, active, onClick,
}: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) => (
  <button
    onClick={onClick}
    aria-label={label}
    aria-current={active ? 'page' : undefined}
    className={`flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors active:scale-95 ${
      active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
    }`}
  >
    {icon}
    <span className="text-[10px] font-medium leading-none">{label}</span>
  </button>
);

const MenuRow = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-primary hover:bg-muted"
  >
    {icon}
    <span className="text-sm font-medium text-foreground">{label}</span>
  </button>
);

export default BottomNav;
