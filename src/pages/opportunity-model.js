// Illustrative planning math, not market evidence or a data access decision.
export function evaluateRoute(x) {
  const keys = ['buyers','price','data','setup','delivery','compute','localShare','coverage','quality'];
  for (const k of keys) if (!Number.isFinite(x[k]) || x[k] < 0) throw new Error('Invalid '+k);
  if (!Number.isInteger(x.buyers) || x.localShare > 100 || x.coverage > 100 || x.quality > 100) throw new Error('Invalid count or percentage');
  const revenue=x.buyers*x.price;
  const variable=x.buyers*(x.delivery+x.compute);
  const cost=x.data+x.setup+variable;
  const surplus=revenue-cost;
  const localDeliverySpend=x.buyers*x.delivery*x.localShare/100;
  const unit=x.price-x.delivery-x.compute;
  return {revenue,cost,surplus,margin:revenue?surplus/revenue:null,localDeliverySpend,
    breakEven:unit>0?Math.ceil((x.data+x.setup)/unit):null,usableCoverage:x.coverage*x.quality/100};
}
