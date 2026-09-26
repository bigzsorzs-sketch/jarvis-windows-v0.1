import { useEffect, useMemo, useState } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { Brain, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MemoryStats from '@/components/memory/MemoryStats';
import MemoryFilters from '@/components/memory/MemoryFilters';
import MemoryEditorCard from '@/components/memory/MemoryEditorCard';
import { saveEncryptedLocalBackup, removeEncryptedLocalBackup } from '@/lib/encryptedLocalBackup';
import EncryptedLocalBackupNotice from '@/components/privacy/EncryptedLocalBackupNotice';

export default function Memoria() {
  const [memories, setMemories] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [linkType, setLinkType] = useState('all');
  const [draft, setDraft] = useState({ content: '', category: 'other', importance: 5, source: 'manual' });

  useEffect(() => {
    jarvis.auth.me()
      .then((currentUser) => {
        if (!currentUser?.email) throw new Error('auth_required');
        return Promise.all([
          jarvis.entities.Memory.filter({ created_by: currentUser.email }, '-created_date'),
          jarvis.entities.Contact.filter({ created_by: currentUser.email }, '-created_date', 100),
          jarvis.entities.BusinessProject.filter({ created_by: currentUser.email }, '-created_date', 100),
        ]);
      })
      .then(async ([memoryRows, contactRows, projectRows]) => {
        setMemories(memoryRows);
        setContacts(contactRows);
        setProjects(projectRows.map((item) => ({ ...item, name: item.name || item.description || 'Untitled project' })));
        const user = await jarvis.auth.me();
        if (user?.email && memoryRows.length > 0) {
          await saveEncryptedLocalBackup('memory-notes', memoryRows, user.email);
        }
      })
      .catch(() => {
        setMemories([]);
        setContacts([]);
        setProjects([]);
      });
  }, []);

  const filteredMemories = useMemo(() => {
    return memories.filter((item) => {
      const searchValue = search.toLowerCase();
      const matchesSearch = !searchValue
        || item.content?.toLowerCase().includes(searchValue)
        || item.linked_entity_name?.toLowerCase().includes(searchValue);
      const matchesCategory = category === 'all' || item.category === category;
      const matchesLink = linkType === 'all'
        || (linkType === 'unlinked' && !item.linked_entity_id)
        || item.linked_entity_type === linkType;
      return matchesSearch && matchesCategory && matchesLink;
    });
  }, [memories, search, category, linkType]);

  const addMemory = async () => {
    if (!draft.content.trim()) return;
    const created = await jarvis.entities.Memory.create({
      content: draft.content.slice(0, 500),
      category: draft.category,
      importance: draft.importance,
      source: 'manual',
    });
    const nextMemories = [created, ...memories];
    setMemories(nextMemories);
    const user = await jarvis.auth.me();
    await saveEncryptedLocalBackup('memory-notes', nextMemories, user?.email || 'default');
    setDraft({ content: '', category: 'other', importance: 5, source: 'manual' });
    setAdding(false);
  };

  const updateMemory = async (id, changes) => {
    const updated = await jarvis.entities.Memory.update(id, changes);
    const nextMemories = memories.map((item) => item.id === id ? updated : item);
    setMemories(nextMemories);
    const user = await jarvis.auth.me();
    await saveEncryptedLocalBackup('memory-notes', nextMemories, user?.email || 'default');
  };

  const deleteMemory = async (id) => {
    await jarvis.entities.Memory.delete(id);
    const nextMemories = memories.filter((item) => item.id !== id);
    setMemories(nextMemories);
    if (nextMemories.length > 0) {
      const user = await jarvis.auth.me();
      await saveEncryptedLocalBackup('memory-notes', nextMemories, user?.email || 'default');
    } else {
      removeEncryptedLocalBackup('memory-notes');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-4 pt-5 pb-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 flex items-center justify-center">
              <Brain size={20} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Memory Dashboard</h1>
              <p className="text-xs text-muted-foreground">View, edit, categorize and link personal facts</p>
            </div>
          </div>
          <button onClick={() => setAdding((prev) => !prev)} className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shrink-0">
            <Plus size={18} className="text-primary-foreground" />
          </button>
        </div>

        <EncryptedLocalBackupNotice label="Memóriák és jegyzet jellegű adatok titkosított lokális mentése aktív" />

        <MemoryStats memories={memories} />

        <MemoryFilters
          search={search}
          setSearch={setSearch}
          category={category}
          setCategory={setCategory}
          linkType={linkType}
          setLinkType={setLinkType}
        />

        <AnimatePresence>
          {adding && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-card border border-border rounded-2xl p-4 space-y-3"
            >
              <textarea
                value={draft.content}
                onChange={(e) => setDraft((prev) => ({ ...prev, content: e.target.value.slice(0, 500) }))}
                placeholder="Add a personal fact to memory..."
                className="w-full min-h-[100px] bg-secondary border border-border rounded-xl p-3 text-sm text-foreground outline-none resize-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))} className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none">
                  <option value="preference">Preference</option>
                  <option value="fact">Fact</option>
                  <option value="habit">Habit</option>
                  <option value="interest">Interest</option>
                  <option value="other">Other</option>
                </select>
                <select value={draft.importance} onChange={(e) => setDraft((prev) => ({ ...prev, importance: Number(e.target.value) }))} className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none">
                  {[1,2,3,4,5,6,7,8,9,10].map((num) => <option key={num} value={num}>Priority {num}</option>)}
                </select>
              </div>
              <button onClick={addMemory} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Save memory</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-3">
          {filteredMemories.map((memory) => (
            <MemoryEditorCard
              key={memory.id}
              memory={memory}
              contacts={contacts}
              projects={projects}
              onSave={updateMemory}
              onDelete={deleteMemory}
            />
          ))}
          {filteredMemories.length === 0 && (
            <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">
              No memories match the current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}