// Every kernel's background jobs, by name. Kernels export `jobs = { 'eXX.name': fn(payload, {progress, cancelled}) }`.
import { jobs as j01 } from './kernels/e01.js';
import { jobs as j02 } from './kernels/e02.js';
import { jobs as j03 } from './kernels/e03.js';
import { jobs as j04 } from './kernels/e04.js';
import { jobs as j05 } from './kernels/e05.js';
import { jobs as j06 } from './kernels/e06.js';
import { jobs as j07 } from './kernels/e07.js';
import { jobs as j08 } from './kernels/e08.js';
import { jobs as j09 } from './kernels/e09.js';
import { jobs as j10 } from './kernels/e10.js';
import { jobs as j11 } from './kernels/e11.js';
import { jobs as j12 } from './kernels/e12.js';
import { jobs as j13 } from './kernels/e13.js';
import { jobs as j14 } from './kernels/e14.js';
import { jobs as j15 } from './kernels/e15.js';
import { jobs as j16 } from './kernels/e16.js';
import { jobs as j17 } from './kernels/e17.js';
import { jobs as j18 } from './kernels/e18.js';
import { jobs as j19 } from './kernels/e19.js';
import { jobs as j20 } from './kernels/e20.js';
import { jobs as j21 } from './kernels/e21.js';

export const JOBS = Object.assign({}, j01, j02, j03, j04, j05, j06, j07, j08, j09, j10, j11, j12, j13, j14, j15, j16, j17, j18, j19, j20, j21);
