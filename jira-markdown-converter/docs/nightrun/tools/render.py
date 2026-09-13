#!/usr/bin/env python3
"""render.py <template-name> KEY=VALUE ... -> Prompt-Text mit ersetzten Platzhaltern"""
import sys, re
import os; T = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'templates') + '/'
txt = open(T + sys.argv[1] + '.md').read()
vals = dict(kv.split('=', 1) for kv in sys.argv[2:])
vals.setdefault('REPO', '/Volumes/sources/tools/webkit-ext-nightrun')
vals.setdefault('STATE', '/Users/pascal/nightrun-webkit-ext')
def rep(m):
    k = m.group(1)
    if k not in vals: print('MISSING ' + k, file=sys.stderr); return m.group(0)
    return vals[k]
sys.stdout.write(re.sub(r'\{\{(\w+)\}\}', rep, txt))
