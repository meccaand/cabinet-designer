import type { Project } from '../core/model';

/** A project name made safe for a file name ("Kitchen: v2?" → "Kitchen v2"). */
export function fileBase(project: Project): string {
  return project.name.replace(/[^\w -]+/g, '').trim() || 'project';
}

/** Save `data` as a file through the browser's download. */
export function download(fileName: string, data: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data);
  a.download = fileName;
  a.click();
  // Revoke after the click has been handled; Safari cancels downloads revoked synchronously.
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

/** CSV with a byte-order mark, so spreadsheet apps read ≈ and × as UTF-8. */
export const csvBlob = (text: string) => new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });

export function downloadProjectJson(project: Project): void {
  download(
    `${fileBase(project)}.cabinets.json`,
    new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
  );
}
