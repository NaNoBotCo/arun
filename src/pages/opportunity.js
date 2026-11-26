// Opportunity workbench. No network calls, credentials or real partner data.
import { h, button, fmtMoney, fmtPct, fmt, slider } from '../core/ui.js';
import { exportPanel } from '../core/exportbox.js';
import { evaluateRoute } from './opportunity-model.js';

const ROUTES = [
  {id:'open',name:'Open and public data',status:'Candidate — licence and validation required',desc:'Start with public elevation, historical flood and weather products. Validate against local observations; preserve source, date, licence and resolution.',data:0,setup:12000,coverage:65,quality:70},
  {id:'licensed',name:'Licensed geospatial products',status:'Candidate — no purchase or licence assumed',desc:'Evaluate Esri or other providers against open baselines. Check redistribution, derived products, retention and compute rights before contracting.',data:18000,setup:8000,coverage:85,quality:85},
  {id:'partner',name:'Authorized mobility aggregates',status:'Unconfirmed — no access or agreement',desc:'Explore an authorized commercial mobility partner. Use coarse time and area totals, not trajectories or identifiers. Fall back to public road networks and synthetic demand.',data:15000,setup:15000,coverage:80,quality:80},
  {id:'iot',name:'Our own environmental observations',status:'Proposed — no deployed network assumed',desc:'Contributor-led IoT: opt-in rainfall, water level, temperature and equipment telemetry. Budget devices, calibration, installation, connectivity and maintenance; no personal sensing.',data:9000,setup:22000,coverage:50,quality:90}
];
const CASES = [
 ['Sky Reach','Contributor-led earth observation','Site risk, agriculture and infrastructure','e15','Historical imagery and validated change detection; independent product option.'],
 ['Face Shield','Contributor-led privacy-preserving vision','Facilities and occupancy analytics','e05','Test with synthetic or consented footage; only aggregate outputs, no identity or tracking.'],
 ['IoT','Contributor-led instrumentation','Environmental monitoring subscriptions','e18','Calibrated non-personal measurements; compare against reference observations.'],
 ['Possible Worlds','Simulation and optimization','Risk analysis for developers and operators','e03','Compare alternatives, record assumptions and uncertainty.']
];
export function opportunity(main) {
  const state={buyers:8,price:12000,delivery:2500,compute:500,localShare:75};
  const choices=ROUTES.map(r=>({...r}));
  const result=h('div',{class:'table-wrap',role:'region','aria-label':'Illustrative route comparison'});
  const exportOut=h('div',{});
  const controls=h('div',{class:'cards'});
  const fields=[
    ['buyers','Paying contracts per year',0,100,1,'contracts'],
    ['price','Price per contract',0,100000,1000,'US$'],
    ['delivery','Delivery cost per contract',0,50000,500,'US$'],
    ['compute','Compute cost per contract',0,10000,100,'US$'],
    ['localShare','Cambodian share of delivery spend',0,100,5,'%']
  ];
  const numberFields=[['data','Annual data and maintenance',0,100000,1000,'US$'],['setup','Year-one setup',0,100000,1000,'US$'],['coverage','Coverage assumption',0,100,5,'%'],['quality','Usable fraction of covered data',0,100,5,'%']];
  const add=(host,obj,defs)=>defs.forEach(([name,label,min,max,step,unit])=>host.append(slider({name,label,min,max,step,unit,integer:true},obj[name],v=>{obj[name]=v;paint();}).el));
  const common=h('div',{class:'card'},h('h3',{},'Shared customer and cost assumptions'));
  add(common,state,fields);
  for(const r of choices){
    const card=h('div',{class:'card'},h('h3',{},r.name),h('p',{class:'small muted'},r.status),h('p',{},r.desc));
    add(card,r,numberFields);controls.append(card);
  }
  let rows=[];
  function paint(){
    rows=choices.map(r=>({id:r.id,name:r.name,status:r.status,inputs:{...state,data:r.data,setup:r.setup,coverage:r.coverage,quality:r.quality},...evaluateRoute({...state,...r})}));
    result.replaceChildren(h('table',{class:'dtable'},h('thead',{},h('tr',{},['Route','Year-one revenue','Year-one modeled cost','Surplus','Margin','Break-even contracts','Local delivery spend','Usable coverage assumption'].map(x=>h('th',{scope:'col'},x)))),
      h('tbody',{},rows.map(r=>h('tr',{},h('th',{scope:'row'},r.name),h('td',{},fmtMoney(r.revenue)),h('td',{},fmtMoney(r.cost)),h('td',{},fmtMoney(r.surplus)),h('td',{},fmtPct(r.margin)),h('td',{},r.breakEven===null?'Not attainable at this price':fmt(r.breakEven,0)),h('td',{},fmtMoney(r.localDeliverySpend)),h('td',{},fmtPct(r.usableCoverage/100)))))));
    exportOut.replaceChildren();
  }
  paint();
  main.replaceChildren(h('div',{class:'wrap page'},
    h('h1',{},'Cambodia opportunity workbench'),
    h('p',{class:'lede'},'Build an exportable computational service in Cambodia. Start with a paid decision problem, select a data route, and measure the cost of answering it. The following is a planning instrument, not evidence of a contract or a forecast.'),
    h('h2',{},'Find the expensive decision first'),
    h('div',{class:'cards'},
      h('div',{class:'card'},h('h3',{},'Institutional knowledge'),h('p',{},'Invite experienced development practitioners, including former aid-sector specialists, to identify repeated expensive problems, failed tools, budget owners and procurement routes. Seek compensated participation where appropriate. No affiliation or commitment is implied.')),
      h('div',{class:'card'},h('h3',{},'Who pays'),h('p',{},'Test foreign-owned enterprises, international consultancies and development implementers alongside Cambodian banks, exporters and infrastructure operators. Separate payer, beneficiary and delivery partner. Ask for a paid pilot, not just enthusiasm.')),
      h('div',{class:'card'},h('h3',{},'Value retained in Cambodia'),h('p',{},'Track local engineering, sensor operations, data-center spend, skill development and revenue retained. Validate prices and compute demand with buyers and the facility. Do not confuse grants, contract face value or spending with profit.'))),
    h('h2',{},'Four data routes, one decision'),
    h('p',{},'Compare public data, licensed products, an authorized mobility partnership and independently collected IoT. A cheaper dataset is not necessarily a better dataset. No route is automatically approved or selected.'),
    common,controls,
    h('h3',{},'Year-one comparison'),
    h('p',{class:'small muted'},'Synthetic USD inputs. Cost includes only entered data, setup, delivery and compute; excludes other company overhead, taxes and financing. Local delivery spend is a subset of cost, not profit or a complete measure of local value. Usable coverage is coverage multiplied by the assumed usable fraction, not a scientific accuracy estimate.'),
    result,
    h('div',{class:'btnrow'},button('Export comparison as JSON',()=>exportPanel(exportOut,{filename:'arun-opportunity.json',mime:'application/json',text:JSON.stringify({status:'ILLUSTRATIVE',rows},null,2)+'\n'}),{kind:'small'})),exportOut,
    h('h2',{},'Contributor-led products'),
    h('div',{class:'cards'},CASES.map(([name,origin,buyer,ex,desc])=>h('div',{class:'card'},h('span',{class:'tagline'},origin),h('h3',{},name),h('p',{},buyer),h('p',{},desc),h('a',{href:'#'+ex},'Related existing exhibit →')))),
    h('p',{class:'small muted'},'Concepts retain independent standing and contributor credit. These links are related ARUN prototypes, not claims that the contributor products are implemented. Confirm authorship and permission before public naming or integration.'),
    h('h2',{},'Civilian resilience by design'),
    h('p',{},'The long-term intent is atrocity and genocide prevention through resilience-enhancing commercial capabilities. Better continuity of food, medicine and essential services; privacy-preserving analytics; and broader access to economic opportunity are testable intermediate outcomes. They are not proof that an atrocity has been prevented.'),
    h('ul',{},['No individual movement histories, biometric identification, protected-group profiling or targeting of vulnerable communities.','Require authority, purpose, licence, data minimization, aggregation and independent review before enabling a real source. Refuse unsafe use even when a buyer will pay.','Measure the benefit and its distribution with independent partners; publish only safe, coarse results.'].map(s=>h('li',{},s))),
    h('div',{class:'btnrow'},h('a',{class:'btn',href:'#sources'},'Source and adapter gates'),h('a',{class:'btn',href:'#desk'},'Full revenue sandbox'),h('a',{class:'btn',href:'#e19'},'Compute economics'),h('a',{class:'btn',href:'#trust'},'Trust and limits'),h('a',{class:'btn',href:'#ideas'},'Compare team proposals'))));
  return {destroy(){}};
}
