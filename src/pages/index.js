// Pages by route name. Each is fn(mainEl) -> { destroy() }.
import { home } from './home.js';
import { lab } from './lab.js';
import { tour } from './tour.js';
import { desk } from './desk.js';
import { trust } from './trust.js';
import { sources } from './sources.js';
import { compare } from './compare.js';
import { ideas } from './ideas.js';
import { status } from './status.js';
import { wonder } from './wonder.js';
import { mornings, minutes } from './mornings.js';

export const PAGES = { home, lab, tour, desk, trust, sources, compare, ideas, status, wonder, mornings, minutes };
