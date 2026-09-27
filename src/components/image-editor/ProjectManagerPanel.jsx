import { useState, useEffect } from 'react';
import { FolderOpen, Cloud, Trash2, Camera, RotateCcw, ChevronDown, ChevronRight, HardDrive } from 'lucide-react';
import { deserializeLayers } from '@/hooks/useProjectManager';

export default function ProjectManagerPanel({
  layers, filterState, CANVAS_W, CANVAS_H,
  currentProjectId, projects,
  onSaveLocal, onSaveServer, onLoadProject, onAddSnapshot, onDeleteSnapshot, onDeleteProject,
  saving,
}) {
  const [projectName, setProjectName] = useState('Névtelen projekt');
  const [snapName, setSnapName] = useState('');
  const [expandedProject, setExpandedProject] = useState(null);
  const [serverProjects, setServerProjects] = useState([]);
  const [tab, setTab] = useState('local'); // 'local' | 'server'
  const [loadingServer, setLoadingServer] = useState(false);
  const [msg, setMsg] = useState('');

  const currentProject = projects.find(p => p.id === currentProjectId);

  useEffect(() => {
    if (currentProject) setProjectName(currentProject.name);
  }, [currentProjectId]);

  const flash = (text) => { setMsg(text); setTimeout(() => setMsg(''), 2500); };

  const handleSaveLocal = () => {
    onSaveLocal(projectName, currentProjectId);
    flash('✅ Mentve helyileg');
  };

  const handleSaveServer = async () => {
    await onSaveServer(projectName, currentProjectId);
    flash('☁️ Szerverre mentve');
  };

  const handleAddSnap = () => {
    if (!currentProjectId) { flash('⚠️ Először mentsd el a projektet!'); return; }
    const name = snapName.trim() || `Pillanatfelvétel ${new Date().toLocaleTimeString('hu')}`;
    onAddSnapshot(currentProjectId, name);
    setSnapName('');
    flash(`📸 "${name}" elmentve`);
  };

  const handleLoadSnap = async (snap) => {
    const restoredLayers = await deserializeLayers(snap.layers_data);
    onLoadProject(restoredLayers, null);
    flash('↩️ Állapot visszaállítva');
  };

  const handleLoadProject = async (project) => {
    const restoredLayers = await deserializeLayers(project.layers_data);
    onLoadProject(restoredLayers, project.filter_state || null, project.id);
    setProjectName(project.name);
    flash(`📂 "${project.name}" betöltve`);
  };

  const loadServer = async () => {
    setLoadingServer(true);
    try {
      const list = await import('@/api/jarvisClient').then(async (m) => {
        const user = await m.jarvis.auth.me();
        return user?.email ? m.jarvis.entities.ImageProject.filter({ created_by: user.email }, '-updated_date', 30) : [];
      });
      setServerProjects(list);
    } finally {
      setLoadingServer(false);
    }
  };

  useEffect(() => {
    if (tab === 'server') loadServer();
  }, [tab]);

  const fmt = (iso) => iso ? new Date(iso).toLocaleString('hu', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="w-64 bg-card border-r border-border flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <FolderOpen size={13} className="text-primary" />
        <span className="text-xs font-semibold text-foreground">Projektek</span>
      </div>

      {/* Project name + save */}
      <div className="px-3 pt-2 pb-1 space-y-2 border-b border-border">
        <input
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          className="w-full bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none"
          placeholder="Projekt neve..."
        />
        <div className="flex gap-1.5">
          <button onClick={handleSaveLocal}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-primary/15 text-primary text-[11px] font-medium hover:bg-primary/25 transition-colors">
            <HardDrive size={11} /> Helyi
          </button>
          <button onClick={handleSaveServer} disabled={saving}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-accent/15 text-accent text-[11px] font-medium hover:bg-accent/25 transition-colors disabled:opacity-40">
            <Cloud size={11} /> {saving ? '...' : 'Szerver'}
          </button>
        </div>
        {msg && <p className="text-[10px] text-primary">{msg}</p>}
      </div>

      {/* Snapshot creator */}
      {currentProjectId && (
        <div className="px-3 py-2 border-b border-border space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Pillanatfelvétel</p>
          <div className="flex gap-1.5">
            <input value={snapName} onChange={e => setSnapName(e.target.value)}
              placeholder="Neve (opcionális)"
              className="flex-1 bg-secondary border border-border rounded-lg px-2 py-1 text-[11px] text-foreground outline-none" />
            <button onClick={handleAddSnap}
              className="p-1.5 rounded-lg bg-secondary hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors">
              <Camera size={13} />
            </button>
          </div>
          {/* Snapshots list for current project */}
          {currentProject?.snapshots?.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {currentProject.snapshots.map(snap => (
                <div key={snap.id} className="flex items-center gap-1.5 group">
                  <img src={snap.thumbnail} alt="" className="w-8 h-5 object-cover rounded border border-border shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-foreground truncate">{snap.name}</p>
                    <p className="text-[9px] text-muted-foreground">{fmt(snap.timestamp)}</p>
                  </div>
                  <button onClick={() => handleLoadSnap(snap)} title="Visszaállítás"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all">
                    <RotateCcw size={11} />
                  </button>
                  <button onClick={() => onDeleteSnapshot(currentProjectId, snap.id)} title="Törlés"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {['local', 'server'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-[11px] font-medium transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'local' ? '💾 Helyi' : '☁️ Szerver'}
          </button>
        ))}
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'local' && (
          projects.length === 0
            ? <p className="text-[11px] text-muted-foreground text-center py-6">Még nincs projekt</p>
            : projects.map(p => (
              <ProjectRow key={p.id} project={p} current={p.id === currentProjectId}
                expanded={expandedProject === p.id}
                onToggleExpand={() => setExpandedProject(prev => prev === p.id ? null : p.id)}
                onLoad={() => handleLoadProject(p)}
                onDelete={() => onDeleteProject(p.id)}
                onLoadSnap={handleLoadSnap}
                onDeleteSnap={(sid) => onDeleteSnapshot(p.id, sid)}
                fmt={fmt}
              />
            ))
        )}
        {tab === 'server' && (
          loadingServer
            ? <p className="text-[11px] text-muted-foreground text-center py-6">Betöltés...</p>
            : serverProjects.length === 0
              ? <p className="text-[11px] text-muted-foreground text-center py-6">Még nincs szerveren mentett projekt</p>
              : serverProjects.map(p => (
                <ProjectRow key={p.id} project={p} current={false}
                  expanded={expandedProject === p.id}
                  onToggleExpand={() => setExpandedProject(prev => prev === p.id ? null : p.id)}
                  onLoad={() => handleLoadProject(p)}
                  onDelete={() => {}}
                  onLoadSnap={handleLoadSnap}
                  onDeleteSnap={() => {}}
                  fmt={fmt}
                />
              ))
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project, current, expanded, onToggleExpand, onLoad, onDelete, onLoadSnap, onDeleteSnap, fmt }) {
  return (
    <div className={`border-b border-border/50 ${current ? 'bg-primary/5' : ''}`}>
      <div className="flex items-center gap-2 px-2 py-1.5 group cursor-pointer" onClick={onLoad}>
        {project.thumbnail
          ? <img src={project.thumbnail} alt="" className="w-10 h-7 object-cover rounded border border-border shrink-0" />
          : <div className="w-10 h-7 bg-secondary rounded border border-border shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-medium truncate ${current ? 'text-primary' : 'text-foreground'}`}>{project.name}</p>
          <p className="text-[9px] text-muted-foreground">{fmt(project.updated_at || project.updated_date)}</p>
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {project.snapshots?.length > 0 && (
            <button onClick={e => { e.stopPropagation(); onToggleExpand(); }}
              className="p-1 rounded text-muted-foreground hover:text-primary">
              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded text-muted-foreground hover:text-destructive">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
      {expanded && project.snapshots?.length > 0 && (
        <div className="pl-4 pr-2 pb-1.5 space-y-1 bg-secondary/30">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide pt-1">Pillanatfelvételek</p>
          {project.snapshots.map(snap => (
            <div key={snap.id} className="flex items-center gap-1.5 group/snap">
              <img src={snap.thumbnail} alt="" className="w-7 h-5 object-cover rounded border border-border shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-foreground truncate">{snap.name}</p>
                <p className="text-[9px] text-muted-foreground">{fmt(snap.timestamp)}</p>
              </div>
              <button onClick={() => onLoadSnap(snap)} className="opacity-0 group-hover/snap:opacity-100 text-muted-foreground hover:text-primary p-0.5">
                <RotateCcw size={10} />
              </button>
              <button onClick={() => onDeleteSnap(snap.id)} className="opacity-0 group-hover/snap:opacity-100 text-muted-foreground hover:text-destructive p-0.5">
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}