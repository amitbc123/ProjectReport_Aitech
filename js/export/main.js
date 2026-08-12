/* Export Plan — entry point. Importing file-intake.js pulls in the rest of
   the module graph transitively (columns, format, rows, state, kpi,
   filter-bar, pie, render, idb-store). epBootstrap() is the same tail call
   the original inline script ended with. */
import './file-intake.js';
import { epBootstrap } from './idb-store.js';

epBootstrap();
