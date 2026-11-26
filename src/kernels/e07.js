// E07 The buyer's desk: unit economics of a report product, from measured or entered compute. Pure.

export const METHOD_VERSION = 'e07-desk-1.0.0';

export const BUYERS = {
  developer: { label: 'Property developer', asset: 'site', product: 'Scenario comparison and physical hazard report', recurring: 'Report credits, site monitoring' },
  hotel: { label: 'Riverside hotel', asset: 'hotel', product: 'Local weather and flood decisions for one site', recurring: 'Site subscription, sensor service' },
  farm: { label: 'Farm group', asset: 'farm', product: 'Water and weather decisions for the season', recurring: 'Season subscription, sensor service' },
  insurer: { label: 'Insurer or risk engineer', asset: 'portfolio', product: 'Ensemble hazard analysis for insured sites', recurring: 'Annual API access, usage' }, // stylecheck: allow — job title from the spec's buyer table
  engineer: { label: 'Infrastructure engineer', asset: 'network', product: 'Intervention and redundancy study', recurring: 'Project fee, model refresh' },
};

export const LEVELS = { summary: { credits: 1, label: 'Summary' }, standard: { credits: 3, label: 'Standard' }, full: { credits: 8, label: 'Full' } };

export function validate(p) {
  const R = {
    reportsPerYear: [0, 1e6], pricePerCredit_usd: [0, 1e6], cpuHoursPerReport: [0, 1e6], cpuCost_usd_h: [0, 100], storage_usd: [0, 1e5],
    field_usd: [0, 1e6], fixed_usd_y: [0, 1e9],
  };
  for (const [k, [lo, hi]] of Object.entries(R)) if (!(typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] >= lo && p[k] <= hi)) throw new Error(`${k} must be between ${lo} and ${hi}.`);
  if (!LEVELS[p.level]) throw new Error('Unknown report level.');
}

// Revenue, variable cost, contribution, margin, break-even, value per compute-hour.
export function economics(p) {
  validate(p);
  const price = p.pricePerCredit_usd * LEVELS[p.level].credits;
  const computePerReport = p.cpuHoursPerReport * p.cpuCost_usd_h;
  const variablePerReport = computePerReport + p.storage_usd + p.field_usd;
  const revenue = p.reportsPerYear * price;
  const variable = p.reportsPerYear * variablePerReport;
  const contribution = revenue - variable;
  const margin = revenue > 0 ? contribution / revenue : null;
  const unitContribution = price - variablePerReport;
  const breakEvenReports = p.fixed_usd_y === 0 ? 0 : unitContribution > 0 ? Math.ceil(p.fixed_usd_y / unitContribution) : null;
  const cpuHours = p.reportsPerYear * p.cpuHoursPerReport;
  return {
    price, computePerReport, variablePerReport, revenue, variable, contribution, margin, unitContribution,
    operatingResult: contribution - p.fixed_usd_y, breakEvenReports, cpuHours,
    revenuePerCpuHour: cpuHours > 0 ? revenue / cpuHours : null,
  };
}

// One-at-a-time ±swing on each assumption; returns the change in yearly contribution.
export function sensitivity(p, swing = 0.2) {
  const base = economics(p).contribution;
  const keys = ['pricePerCredit_usd', 'reportsPerYear', 'cpuHoursPerReport', 'cpuCost_usd_h', 'field_usd', 'storage_usd'];
  return keys.map((k) => {
    const lo = economics({ ...p, [k]: p[k] * (1 - swing) }).contribution - base;
    const hi = economics({ ...p, [k]: p[k] * (1 + swing) }).contribution - base;
    return { key: k, low: lo, high: hi, span: Math.abs(hi - lo) };
  }).sort((a, b) => b.span - a.span);
}

// CPU-hours from measured wall time on this device; ms → hours, scaled only by an explicit user factor.
export function measuredCpuHours(jobEntries, mainThreadMs, scale = 1) {
  const ms = jobEntries.reduce((s, j) => s + (Number.isFinite(j.elapsedMs) ? j.elapsedMs : 0), 0) + (mainThreadMs || 0);
  return { measuredMs: ms, cpuHours: (ms / 3.6e6) * scale };
}

export const jobs = {};
