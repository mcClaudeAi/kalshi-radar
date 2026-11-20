# Edge search data: files the pulled rows into one gzip file a day (UTC day of the close), merged by ticker with what is
# there already. Usage: python3 merge.py PULLED_DIR DATA_DIR
import sys, os, glob, gzip, json, datetime, collections
src, dst = sys.argv[1], sys.argv[2]; os.makedirs(dst, exist_ok=True)
new = collections.defaultdict(dict)
for f in glob.glob(os.path.join(src, 'eg-*.jsonl')):
    coin = os.path.basename(f)[3:-6]
    for line in open(f):
        try: cm, yes, tk, mins = json.loads(line)
        except Exception: continue
        d = datetime.datetime.fromtimestamp(cm * 60, datetime.timezone.utc).strftime('%Y-%m-%d')
        new[d][tk] = [coin, cm, yes, tk, mins]
tot = 0
for d, rows in sorted(new.items()):
    p = os.path.join(dst, d + '.jsonl.gz'); have = {}
    if os.path.exists(p):
        with gzip.open(p, 'rt') as g:
            for line in g:
                r = json.loads(line); have[r[3]] = r
    have.update(rows); tot += len(rows)
    with gzip.open(p, 'wt', compresslevel=9) as g:
        for r in sorted(have.values(), key=lambda r: (r[1], r[0])): g.write(json.dumps(r, separators=(',', ':')) + '\n')
    print(d, len(have), 'markets')
print('merged', tot, 'rows into', len(new), 'days')
