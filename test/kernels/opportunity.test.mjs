import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRoute} from '../../src/pages/opportunity-model.js';
const x={buyers:8,price:12000,data:18000,setup:8000,delivery:2500,compute:500,localShare:75,coverage:85,quality:85};
test('hand calculated year-one cost, break-even and local spend',()=>{const r=evaluateRoute(x);assert.equal(r.revenue,96000);assert.equal(r.cost,50000);assert.equal(r.surplus,46000);assert.equal(r.breakEven,3);assert.equal(r.localDeliverySpend,15000);assert.equal(r.usableCoverage,72.25);});
test('zero revenue has no margin',()=>{const r=evaluateRoute({...x,buyers:0});assert.equal(r.margin,null);assert.equal(r.surplus,-26000);});
test('nonpositive unit contribution cannot break even',()=>assert.equal(evaluateRoute({...x,price:3000}).breakEven,null));
test('invalid input is refused',()=>{for(const p of [{buyers:1.5},{data:-1},{coverage:101},{quality:NaN},{localShare:101}])assert.throws(()=>evaluateRoute({...x,...p}));});
