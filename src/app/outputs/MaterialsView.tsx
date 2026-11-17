import type { Draft } from 'immer';
import { useState } from 'react';
import type { Estimate } from '../../core/costing';
import type { HardwareKind, MaterialRole, Project } from '../../core/model';
import { formatMoney, formatThickness, shoppingList } from '../../core/report';
import { useProjectStore } from '../store/projectStore';
import form from '../ui/Form.module.css';
import { LengthInput } from '../ui/LengthInput';
import { NumberInput } from '../ui/NumberInput';
import styles from './Outputs.module.css';

const FT_PER_M = 3.28084;

/** What to buy and what it costs, and the material library it's priced from. */
export function MaterialsView({ project, estimate }: { project: Project; estimate: Estimate }) {
  const imperial = project.units.system === 'imperial';
  return (
    <div className={styles.scroll} tabIndex={0} role="region" aria-label="Materials and cost">
      <section className={styles.group} aria-label="Estimate">
        <h3>Shopping list &amp; estimate</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Item</th>
              <th className={styles.num}>Quantity</th>
              <th className={styles.num}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {shoppingList(project, estimate).map((l) => (
              <tr key={l.key}>
                <td>{l.item}</td>
                <td className={styles.num}>{l.quantity}</td>
                <td className={styles.num}>{formatMoney(l.cost)}</td>
              </tr>
            ))}
            <tr className={styles.total}>
              <td>Total</td>
              <td />
              <td className={styles.num} data-testid="estimate-total">
                {formatMoney(estimate.total)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className={styles.note}>
          Sheets are whole sheets from the layouts. Banding includes 1" per edge for trimming.
        </p>
      </section>

      <ShopSettings project={project} />
      <DefaultMaterials project={project} />
      <Library project={project} imperial={imperial} />
    </div>
  );
}

function ShopSettings({ project }: { project: Project }) {
  const updateShop = useProjectStore((s) => s.updateShop);
  return (
    <section className={styles.group} aria-label="Shop settings">
      <h3>Shop settings</h3>
      <div className={styles.settings}>
        <LengthInput
          label="Saw kerf"
          value={project.shop.kerf}
          units={project.units}
          allowZero
          onCommit={(v) => updateShop((s) => void (s.kerf = v))}
        />
        <LengthInput
          label="Trim factory edges"
          value={project.shop.sheetEdgeTrim}
          units={project.units}
          allowZero
          onCommit={(v) => updateShop((s) => void (s.sheetEdgeTrim = v))}
        />
        <NumberInput
          label="Solid stock waste %"
          value={project.shop.boardFootWaste * 100}
          step={1}
          onCommit={(v) => updateShop((s) => void (s.boardFootWaste = Math.min(100, v) / 100))}
        />
      </div>
    </section>
  );
}

const ROLES: [MaterialRole, string, 'stock' | 'banding'][] = [
  ['carcass', 'Carcass', 'stock'],
  ['back', 'Backs', 'stock'],
  ['shelf', 'Shelves', 'stock'],
  ['platform', 'Toe-kick platform', 'stock'],
  ['door', 'Slab doors & fronts', 'stock'],
  ['frontFrame', 'Shaker frames', 'stock'],
  ['frontPanel', 'Shaker panels', 'stock'],
  ['faceFrame', 'Face frames', 'stock'],
  ['drawerBox', 'Drawer boxes', 'stock'],
  ['drawerBottom', 'Drawer bottoms', 'stock'],
  ['carcassBanding', 'Carcass edge banding', 'banding'],
  ['frontBanding', 'Door edge banding', 'banding'],
];

function DefaultMaterials({ project }: { project: Project }) {
  const setDefault = useProjectStore((s) => s.setDefaultMaterial);
  const m = project.materials;
  return (
    <section className={styles.group} aria-label="Default materials">
      <h3>Default materials</h3>
      <p className={styles.note}>Used by every cabinet that doesn't choose its own.</p>
      <div className={form.grid}>
        {ROLES.map(([role, label, kind]) => {
          const options = kind === 'banding' ? m.banding : [...m.sheets, ...m.solids];
          return (
            <div key={role} className={form.field}>
              <label htmlFor={`default-${role}`}>{label}</label>
              <select
                id={`default-${role}`}
                className={form.select}
                value={project.construction.materials[role]}
                onChange={(e) => setDefault(role, e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type Lists = Project['materials'];

function Library({ project, imperial }: { project: Project; imperial: boolean }) {
  const update = useProjectStore((s) => s.updateMaterials);
  const remove = useProjectStore((s) => s.removeMaterial);
  const [notice, setNotice] = useState<string | null>(null);
  const m = project.materials;
  const units = project.units;
  /** Edit one library item by id. */
  function edit<K extends keyof Lists>(
    list: K,
    id: string,
    fn: (item: Draft<Lists[K][number]>) => void,
  ) {
    update((x) => {
      const item = (x[list] as Draft<Lists[K][number]>[]).find((i) => i.id === id);
      if (item) fn(item);
    });
  }
  const onRemove = (id: string, name: string) =>
    setNotice(remove(id) ? null : `${name} is in use. Choose another material for it first.`);
  const len = (label: string, value: number, set: (v: number) => void) => (
    <LengthInput label={label} value={value} units={units} onCommit={set} />
  );
  const thick = (label: string, value: number, set: (v: number) => void) => (
    <div>
      <LengthInput label={label} value={value} units={units} onCommit={set} />
      <p className={form.hint}>{formatThickness(value, units)}</p>
    </div>
  );

  return (
    <section className={styles.group} aria-label="Material library">
      <h3>Material library</h3>
      {notice && (
        <p className={styles.warn} role="alert">
          {notice}
        </p>
      )}

      <h4 className={form.sectionTitle}>Sheet goods</h4>
      {m.sheets.map((s) => (
        <div key={s.id} className={styles.libraryItem}>
          <NameInput
            value={s.name}
            onCommit={(v) => edit('sheets', s.id, (x) => void (x.name = v))}
          />
          {thick('Thickness (measured)', s.thickness, (v) =>
            edit('sheets', s.id, (x) => void (x.thickness = v)),
          )}
          {len('Sheet length', s.length, (v) => edit('sheets', s.id, (x) => void (x.length = v)))}
          {len('Sheet width', s.width, (v) => edit('sheets', s.id, (x) => void (x.width = v)))}
          <NumberInput
            label="Price per sheet"
            value={s.costPerSheet}
            onCommit={(v) => edit('sheets', s.id, (x) => void (x.costPerSheet = v))}
          />
          <label className={form.check}>
            <input
              type="checkbox"
              checked={s.grain}
              onChange={(e) => edit('sheets', s.id, (x) => void (x.grain = e.target.checked))}
            />
            Has grain
          </label>
          <RemoveButton name={s.name} onClick={() => onRemove(s.id, s.name)} />
        </div>
      ))}
      <button
        type="button"
        className={form.button}
        onClick={() =>
          update((x) => {
            x.sheets.push({
              id: crypto.randomUUID(),
              name: 'New sheet material',
              thickness: 18,
              length: 2438.4,
              width: 1219.2,
              grain: true,
              costPerSheet: 0,
            });
          })
        }
      >
        Add sheet material
      </button>

      <h4 className={form.sectionTitle} style={{ marginTop: 16 }}>
        Solid stock
      </h4>
      {m.solids.map((s) => (
        <div key={s.id} className={styles.libraryItem}>
          <NameInput
            value={s.name}
            onCommit={(v) => edit('solids', s.id, (x) => void (x.name = v))}
          />
          {thick('Finished thickness', s.thickness, (v) =>
            edit('solids', s.id, (x) => void (x.thickness = v)),
          )}
          {thick('Rough thickness', s.roughThickness, (v) =>
            edit('solids', s.id, (x) => void (x.roughThickness = v)),
          )}
          <NumberInput
            label="Price per board foot"
            value={s.costPerBoardFoot}
            onCommit={(v) => edit('solids', s.id, (x) => void (x.costPerBoardFoot = v))}
          />
          <RemoveButton name={s.name} onClick={() => onRemove(s.id, s.name)} />
        </div>
      ))}
      <button
        type="button"
        className={form.button}
        onClick={() =>
          update((x) => {
            x.solids.push({
              id: crypto.randomUUID(),
              name: 'New solid stock',
              thickness: 19.05,
              roughThickness: 25.4,
              costPerBoardFoot: 0,
            });
          })
        }
      >
        Add solid stock
      </button>

      <h4 className={form.sectionTitle} style={{ marginTop: 16 }}>
        Edge banding
      </h4>
      {m.banding.map((b) => (
        <div key={b.id} className={styles.libraryItem}>
          <NameInput
            value={b.name}
            onCommit={(v) => edit('banding', b.id, (x) => void (x.name = v))}
          />
          {thick('Thickness', b.thickness, (v) =>
            edit('banding', b.id, (x) => void (x.thickness = v)),
          )}
          {len('Width', b.width, (v) => edit('banding', b.id, (x) => void (x.width = v)))}
          <NumberInput
            label={imperial ? 'Price per foot' : 'Price per metre'}
            value={imperial ? b.costPerMeter / FT_PER_M : b.costPerMeter}
            onCommit={(v) =>
              edit('banding', b.id, (x) => void (x.costPerMeter = imperial ? v * FT_PER_M : v))
            }
          />
          <label className={form.check}>
            <input
              type="checkbox"
              checked={b.subtractFromCut}
              onChange={(e) =>
                edit('banding', b.id, (x) => void (x.subtractFromCut = e.target.checked))
              }
            />
            Subtract from cut size
          </label>
          <RemoveButton name={b.name} onClick={() => onRemove(b.id, b.name)} />
        </div>
      ))}

      <h4 className={form.sectionTitle} style={{ marginTop: 16 }}>
        Hardware
      </h4>
      {m.hardware.map((h) => (
        <div key={h.id} className={styles.libraryItem}>
          <NameInput
            value={h.name}
            onCommit={(v) => edit('hardware', h.id, (x) => void (x.name = v))}
          />
          <div className={form.field}>
            <label htmlFor={`kind-${h.id}`}>Used for</label>
            <select
              id={`kind-${h.id}`}
              className={form.select}
              value={h.kind}
              onChange={(e) =>
                edit('hardware', h.id, (x) => void (x.kind = e.target.value as HardwareKind))
              }
            >
              <option value="hinge">Hinges</option>
              <option value="slide">Drawer slides (pair)</option>
              <option value="pull">Pulls</option>
              <option value="knob">Knobs</option>
              <option value="shelfPin">Shelf pins</option>
              <option value="pictureLight">Picture lights</option>
              <option value="crownMoulding">Crown moulding</option>
              <option value="baseMoulding">Base moulding</option>
            </select>
          </div>
          {h.kind === 'crownMoulding' || h.kind === 'baseMoulding' ? (
            // Stored per metre; shown per foot in inch projects.
            <NumberInput
              label={imperial ? 'Price per foot' : 'Price per metre'}
              value={imperial ? h.unitCost * 0.3048 : h.unitCost}
              onCommit={(v) =>
                edit('hardware', h.id, (x) => void (x.unitCost = imperial ? v / 0.3048 : v))
              }
            />
          ) : (
            <NumberInput
              label="Price each"
              value={h.unitCost}
              onCommit={(v) => edit('hardware', h.id, (x) => void (x.unitCost = v))}
            />
          )}
          <RemoveButton name={h.name} onClick={() => onRemove(h.id, h.name)} />
        </div>
      ))}
    </section>
  );
}

function RemoveButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`${form.button} ${form.danger}`}
      aria-label={`Remove ${name}`}
      onClick={onClick}
    >
      Remove
    </button>
  );
}

function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const v = draft?.trim();
    setDraft(null);
    if (v && v !== value) onCommit(v);
  };
  return (
    <div className={form.field}>
      <label>
        Name
        <input
          className={form.input}
          value={draft ?? value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
      </label>
    </div>
  );
}
