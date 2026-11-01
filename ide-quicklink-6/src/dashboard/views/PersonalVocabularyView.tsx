import { useState } from 'react';
import {
  Plus,
  Volume2,
  Trash2,
  Search,
  BookMarked,
  Tag,
} from 'lucide-react';
import { VocabularyPhrase } from '../types';
import { initialVocabulary } from '../mockData';
import { GlassCard } from '../components/GlassCard';
import { MagneticButton } from '../../components/MagneticButton';

export function PersonalVocabularyView() {
  const [phrases, setPhrases] = useState<VocabularyPhrase[]>(initialVocabulary);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newPhraseText, setNewPhraseText] = useState('');
  const [newCategory, setNewCategory] = useState<VocabularyPhrase['category']>('daily');
  const [newShortcutCode, setNewShortcutCode] = useState('');
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: 'All Phrases' },
    { id: 'basic-needs', label: 'Basic Needs' },
    { id: 'emergency', label: 'Emergency' },
    { id: 'daily', label: 'Daily Conversation' },
    { id: 'questions', label: 'Questions' },
    { id: 'personal', label: 'Personal Phrases' },
  ];

  const filteredPhrases = phrases.filter((p) => {
    const matchesCat = activeCategory === 'all' || p.category === activeCategory;
    const matchesQuery =
      !searchQuery.trim() ||
      p.phrase.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.shortcutCode && p.shortcutCode.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesQuery;
  });

  const speakPhrase = (phrase: VocabularyPhrase) => {
    setSpeakingId(phrase.id);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(phrase.phrase);
      u.rate = 0.95;
      u.onend = () => setSpeakingId(null);
      u.onerror = () => setSpeakingId(null);
      window.speechSynthesis.speak(u);
    } else {
      setTimeout(() => setSpeakingId(null), 1000);
    }
  };

  const handleAddPhrase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhraseText.trim()) return;

    const newItem: VocabularyPhrase = {
      id: 'voc-' + Date.now(),
      phrase: newPhraseText.trim(),
      category: newCategory,
      shortcutCode: newShortcutCode.trim() || undefined,
      useCount: 0,
      lastUsed: 'Never',
    };

    setPhrases((prev) => [newItem, ...prev]);
    setIsAddModalOpen(false);
    setNewPhraseText('');
    setNewShortcutCode('');
  };

  const handleDeletePhrase = (id: string) => {
    setPhrases((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white font-display">
            Personal Vocabulary & Shortcuts
          </h1>
          <p className="text-sm sm:text-base text-[#D1D1D6] mt-2">
            Save frequently used expressions, quick shortcuts, and emergency phrases for instant retrieval.
          </p>
        </div>

        <MagneticButton
          onClick={() => setIsAddModalOpen(true)}
          soundPitch={740}
          className="px-6 py-3.5 rounded-full bg-white text-[#0D0D0E] font-semibold text-sm hover:bg-[#F0F0F2] transition-all flex items-center gap-2.5 cursor-pointer shadow-[0_0_25px_rgba(255,255,255,0.35)] shrink-0"
        >
          <Plus className="w-4 h-4 text-[#0D0D0E]" />
          <span>Add New Phrase</span>
        </MagneticButton>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-5 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeCategory === cat.id
                ? 'bg-white text-[#0D0D0E] font-bold shadow-[0_0_20px_rgba(255,255,255,0.35)]'
                : 'igloo-glass text-[#8E8E93] hover:text-white hover:border-white/35'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8E93]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter saved vocabulary or shortcuts..."
          className="w-full rounded-2xl bg-[#141416]/80 border border-white/15 pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-[#77777D] focus:outline-none focus:border-white/40 shadow-inner"
        />
      </div>

      {/* Vocabulary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredPhrases.map((phrase) => {
          const isEmergency = phrase.category === 'emergency';
          return (
            <GlassCard
              key={phrase.id}
              interactive
              elevated
              className={`p-6 flex flex-col justify-between gap-5 transition-all ${
                isEmergency ? 'border-red-500/40 bg-red-500/5' : 'hover:border-white/35'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider font-semibold ${
                      isEmergency
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : 'bg-white/10 text-white/80 border border-white/10'
                    }`}
                  >
                    {phrase.category.replace('-', ' ')}
                  </span>
                  {phrase.shortcutCode && (
                    <span className="px-2.5 py-1 rounded-lg bg-white/10 text-white font-mono text-[11px] font-bold border border-white/15">
                      [{phrase.shortcutCode}]
                    </span>
                  )}
                </div>

                <p className="text-base sm:text-lg font-semibold text-white leading-snug">{phrase.phrase}</p>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono text-[#8E8E93]">
                <span>Used {phrase.useCount} times</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => speakPhrase(phrase)}
                    className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/25 text-white flex items-center gap-1.5 cursor-pointer transition-all border border-white/15 hover:border-white/35"
                    title="Speak phrase aloud"
                  >
                    <Volume2 className={`w-3.5 h-3.5 ${speakingId === phrase.id ? 'text-emerald-400 animate-pulse' : ''}`} />
                    <span>{speakingId === phrase.id ? 'Speaking' : 'Speak'}</span>
                  </button>

                  <button
                    onClick={() => handleDeletePhrase(phrase.id)}
                    className="p-1.5 rounded-xl text-[#8E8E93] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Delete phrase"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Add Phrase Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl igloo-glass-elevated border border-white/25 p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-bold text-white font-display mb-1">Add Saved Phrase</h2>
            <p className="text-xs text-[#8E8E93] mb-6">Create a quick phrase for fast conversational retrieval.</p>

            <form onSubmit={handleAddPhrase} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#D1D1D6] mb-1.5 uppercase tracking-wider">
                  Phrase Content
                </label>
                <textarea
                  rows={3}
                  required
                  value={newPhraseText}
                  onChange={(e) => setNewPhraseText(e.target.value)}
                  placeholder="e.g. Could you please adjust my headrest?"
                  className="w-full rounded-2xl bg-[#0D0D0E] border border-white/20 p-3.5 text-sm text-white focus:outline-none focus:border-white leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#D1D1D6] mb-1.5 uppercase tracking-wider">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as VocabularyPhrase['category'])}
                  className="w-full rounded-2xl bg-[#0D0D0E] border border-white/20 px-3.5 py-3 text-sm text-white focus:outline-none focus:border-white"
                >
                  <option value="basic-needs">Basic Needs</option>
                  <option value="emergency">Emergency</option>
                  <option value="daily">Daily Conversation</option>
                  <option value="questions">Questions</option>
                  <option value="personal">Personal Phrases</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#D1D1D6] mb-1.5 uppercase tracking-wider">
                  Shortcut Code (Optional)
                </label>
                <input
                  type="text"
                  value={newShortcutCode}
                  onChange={(e) => setNewShortcutCode(e.target.value.toUpperCase())}
                  placeholder="e.g. H1"
                  className="w-full rounded-2xl bg-[#0D0D0E] border border-white/20 px-4 py-3 text-sm text-white focus:outline-none focus:border-white font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-5 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm text-[#8E8E93] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <MagneticButton
                  soundPitch={880}
                  className="px-6 py-2.5 rounded-xl bg-white text-[#0D0D0E] font-semibold text-sm hover:bg-[#F0F0F2] transition-colors cursor-pointer shadow-md"
                >
                  Save Phrase
                </MagneticButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
