#!/usr/bin/env python3
"""Summarize manually logged blind trials. No invented observations; only first views count."""
import csv, sys, json
from collections import defaultdict

def yes(x):
    v=x.strip().lower()
    if v in ('yes','true','1'): return True
    if v in ('no','false','0'): return False
    raise ValueError('Expected yes/no: '+repr(x))

def seconds(x):
    if not x.strip(): return None
    n=float(x)
    if not 0 <= n <= 60: raise ValueError('seconds must be in 0..60; blank if absent')
    return n

def score(path):
    groups=defaultdict(list); ids=set()
    with open(path,encoding='utf-8',newline='') as f:
        for r in csv.DictReader(f):
            if not r['trial_id'].strip() or r['trial_id'] in ids: raise ValueError('missing/duplicate trial_id')
            ids.add(r['trial_id'])
            if not yes(r['first_view']): continue
            if not r['variant'].strip() or not r['device'].strip(): raise ValueError('variant and device required')
            stop=seconds(r['stop_seconds']); action=seconds(r['action_seconds'])
            groups[r['variant']].append(dict(attention=stop is not None and stop<=5, action=action is not None and action<=15, question=yes(r['unsolicited_question']), hold=yes(r['asked_to_hold']), benefit=yes(r['benefit_correct']), data=yes(r['data_status_correct']), failure=yes(r['hard_gate_failure'])))
    result={}
    for k,rows in groups.items():
        n=len(rows); counts={metric:sum(r[metric] for r in rows) for metric in rows[0]}
        result[k]={'n':n,'counts':counts,'provisional':n<6,'observational_targets_met': n>=6 and counts['failure']==0 and counts['attention']/n>=2/3 and counts['action']/n>=2/3 and counts['benefit']/n>=2/3 and counts['data']/n>=5/6}
    return result or {'status':'No eligible observations; no conclusion.'}
if __name__=='__main__':
    print(json.dumps(score(sys.argv[1]),indent=2))
