#!/usr/bin/env python3
"""State-Helfer: st.py init | st.py set key=value ... | st.py log "<text>" | st.py show"""
import json, sys, os, datetime
S = os.path.expanduser('~/nightrun-webkit-ext')
SF = os.path.join(S, 'state.json')
def now(): return datetime.datetime.now().astimezone().replace(microsecond=0).isoformat()
def load(): return json.load(open(SF))
def save(st): json.dump(st, open(SF, 'w'), indent=2, ensure_ascii=False); open(SF,'a').write('\n')
def parse(v):
    try: return json.loads(v)
    except Exception: return v
def setpath(st, path, val):
    keys = path.split('.'); d = st
    for k in keys[:-1]:
        if k not in d or d[k] is None: d[k] = {}
        d = d[k]
    d[keys[-1]] = val
cmd = sys.argv[1]
if cmd == 'init':
    iss = json.load(open(sys.argv[2]))
    st = {'run_id': datetime.datetime.now().strftime('nightrun-%Y%m%d-%H%M'), 'started_at': now(), 'max_hours': 9,
          'root_base': iss['root_base'], 'last_good_branch': iss['root_base'], 'order': iss['order'],
          'consecutive_parked': 0, 'current': None,
          'issues': {d: {'gh': v['number'], 'max_rounds': v['max_rounds'], 'status': 'pending', 'branch': None, 'base': None,
                         'pr': None, 'rounds': 0, 'calls': 0, 'started_at': None, 'note': ''} for d, v in iss['issues'].items()}}
    save(st); print('init ok', st['run_id'])
elif cmd == 'set':
    st = load()
    for kv in sys.argv[2:]:
        k, v = kv.split('=', 1); setpath(st, k, parse(v))
    save(st); print('set ok')
elif cmd == 'calls':  # st.py calls 25 24 03  -> increment calls for each doc
    st = load()
    for d in sys.argv[2:]: st['issues'][d]['calls'] += 1
    save(st); print('calls', {d: st['issues'][d]['calls'] for d in sys.argv[2:]})
elif cmd == 'log':
    open(os.path.join(S, 'log.md'), 'a').write(now() + ' ' + sys.argv[2] + '\n'); print('logged')
elif cmd == 'show':
    st = load(); c = st['current']
    print('now', now(), 'started', st['started_at'], 'last_good', st['last_good_branch'], 'parked_seq', st['consecutive_parked'])
    print('current', json.dumps(c))
    print({d: (v['status'], v['pr'], v['rounds'], v['calls']) for d, v in st['issues'].items() if v['status'] != 'pending'})
    print('pending', [g for g in st['order'] if st['issues'][g[0]]['status'] == 'pending'])
