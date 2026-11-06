import { useEffect, useRef, useState } from 'react';
import { createProject, loadProject, type Project } from '../../core/model';
import { downloadProjectJson } from '../download';
import { repository } from '../persistence/session';
import type { ProjectSummary } from '../persistence/repository';
import { createSampleProject } from '../sample';
import { useProjectStore } from '../store/projectStore';
import { useViewerStore } from '../store/viewerStore';
import styles from './ProjectsDialog.module.css';
import form from './Form.module.css';

/** Saved projects: open, start new ones, rename, delete, and move them in and out as JSON. */
export function ProjectsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const project = useProjectStore((s) => s.project);
  const openProject = useProjectStore((s) => s.openProject);
  const rename = useProjectStore((s) => s.rename);
  const select = useViewerStore((s) => s.select);
  const [list, setList] = useState<ProjectSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState(project.name);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setName(project.name);
      setMessage(null);
      void repository.list().then(setList);
    }
    if (!open && d.open) d.close();
  }, [open, project.name]);

  const switchTo = async (next: Project) => {
    await repository.save(next);
    openProject(next);
    select(null);
    onClose();
  };

  const openSaved = async (id: string) => {
    const result = loadProject(await repository.load(id));
    if (result.ok) await switchTo(result.value);
    else setMessage(`That project can't be opened: ${result.error}`);
  };

  const remove = async (summary: ProjectSummary) => {
    if (!window.confirm(`Delete "${summary.name}"? This can't be undone.`)) return;
    await repository.remove(summary.id);
    const rest = await repository.list();
    setList(rest);
    if (summary.id === project.id) {
      const next = rest[0];
      if (next) await openSaved(next.id);
      else await switchTo(blankProject());
    }
  };

  const importJson = async (file: File) => {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      return setMessage(`${file.name} isn't a JSON file.`);
    }
    const result = loadProject(raw);
    if (!result.ok) return setMessage(`${file.name} can't be imported: ${result.error}`);
    const taken = list.some((p) => p.id === result.value.id);
    await switchTo(taken ? { ...result.value, id: crypto.randomUUID() } : result.value);
  };

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== project.name) rename(trimmed);
  };

  return (
    <dialog ref={dialog} className={styles.dialog} aria-label="Projects" onClose={onClose}>
      <div className={styles.head}>
        <h2>Projects</h2>
        <button type="button" className={form.button} onClick={onClose}>
          Close
        </button>
      </div>

      <div className={form.field}>
        <label htmlFor="project-name">This project's name</label>
        <input
          id="project-name"
          className={form.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && commitName()}
        />
      </div>

      <div className={form.row}>
        <button type="button" className={form.button} onClick={() => void switchTo(blankProject())}>
          New project
        </button>
        <button
          type="button"
          className={form.button}
          onClick={() => void switchTo({ ...createSampleProject(), id: crypto.randomUUID() })}
        >
          New sample project
        </button>
        <button type="button" className={form.button} onClick={() => downloadProjectJson(project)}>
          Export JSON
        </button>
        <label className={form.button}>
          Import JSON…
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importJson(file);
            }}
          />
        </label>
      </div>
      {message && (
        <p role="alert" className={form.error}>
          {message}
        </p>
      )}

      <h3 className={form.sectionTitle} style={{ marginTop: 16 }}>
        Saved in this browser
      </h3>
      <ul className={styles.list}>
        {list.map((p) => (
          <li key={p.id} aria-current={p.id === project.id}>
            <span>
              <strong>{p.name}</strong>
              <small>Saved {new Date(p.updatedAt).toLocaleString()}</small>
            </span>
            {p.id !== project.id && (
              <button type="button" className={form.button} onClick={() => void openSaved(p.id)}>
                Open
              </button>
            )}
            <button
              type="button"
              className={`${form.button} ${form.danger}`}
              aria-label={`Delete ${p.name}`}
              onClick={() => void remove(p)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <p className={form.hint}>
        Projects are saved automatically in this browser. Export JSON to back them up or move them
        to another computer.
      </p>
    </dialog>
  );
}

/** A new project starts with no walls: the main view asks for the room first (ADR-035). */
function blankProject(): Project {
  return { ...createProject(crypto.randomUUID(), 'Untitled project'), room: { walls: [] } };
}
