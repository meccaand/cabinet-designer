import { lazy } from 'react';

/** three.js is most of the bundle; load it after the shell so the app appears immediately. */
export const Viewer = lazy(() => import('./Viewer').then((m) => ({ default: m.Viewer })));
