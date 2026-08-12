/* Project Report — entry point. Importing file-intake.js pulls in the rest
   of the module graph transitively (state, filters, kpi, filter-bar,
   timeline, ranked, status, table, render, the two parsers, and
   folder-autoload for cacheFile). bootstrap() is the same tail call the
   original inline script ended with. */
import './file-intake.js';
import { bootstrap } from './folder-autoload.js';

bootstrap();
