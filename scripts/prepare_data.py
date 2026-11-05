"""Build the offline dataset from pinned NOAA snapshots; Python standard library only.

Run from the app folder: python scripts/prepare_data.py [--download]
AI-assisted implementation; see ACKNOWLEDGMENTS.md for sources and scope.
"""
from pathlib import Path
import calendar
import csv
from html.parser import HTMLParser
import hashlib
import json
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data-raw'
BASE = 'https://www.ncei.noaa.gov/monitoring-content/data/us/climdiv/monthly/current/'
FILES = {
    'climdiv-pcpnst-v1.0.0-20261006': BASE + 'climdiv-pcpnst-v1.0.0-20261006',
    'climdiv-tmpcst-v1.0.0-20261006': BASE + 'climdiv-tmpcst-v1.0.0-20261006',
    'oni-v5.html': 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/oni/v5/',
    'state-readme.txt': BASE + 'state-readme.txt',
}
STATE_NAMES = 'Alabama,Arizona,Arkansas,California,Colorado,Connecticut,Delaware,Florida,Georgia,Idaho,Illinois,Indiana,Iowa,Kansas,Kentucky,Louisiana,Maine,Maryland,Massachusetts,Michigan,Minnesota,Mississippi,Missouri,Montana,Nebraska,Nevada,New Hampshire,New Jersey,New Mexico,New York,North Carolina,North Dakota,Ohio,Oklahoma,Oregon,Pennsylvania,Rhode Island,South Carolina,South Dakota,Tennessee,Texas,Utah,Vermont,Virginia,Washington,West Virginia,Wisconsin,Wyoming'.split(',')
ABBREVIATIONS = 'AL AZ AR CA CO CT DE FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split()
REGIONS = {
    'Northeast': 'ME NH VT MA RI CT NY NJ PA'.split(),
    'Midwest': 'OH IN IL MI WI IA KS MN MO NE ND SD'.split(),
    'South': 'DE FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX'.split(),
    'West': 'AZ CO ID MT NV NM UT WY CA OR WA'.split(),
}
TILES = [
    '...........ME', 'WA ID MT ND MN WI . MI . NY VT NH',
    'OR NV WY SD IA IL IN OH PA NJ MA .', 'CA UT CO NE MO KY WV VA MD DE CT RI',
    '. AZ NM KS AR TN NC SC . . . .', '. . . OK LA MS AL GA . . . .',
    '. . . TX . . . . FL . . .',
]
# The first row is written explicitly to avoid ambiguous character parsing.
TILES[0] = '. . . . . . . . . . . ME'

def read_monthly(path, element):
    records = {}
    for line in path.read_text().splitlines():
        state, year = int(line[:3]), int(line[6:10])
        if not 1 <= state <= 48:
            continue
        assert line[3] == '0' and int(line[4:6]) == element
        values = [float(v) for v in line[10:].split()]
        assert len(values) == 12
        key = (state, year)
        assert key not in records, f'Duplicate monthly key {key}'
        records[key] = [None if (v < 0 if element == 1 else v <= -99.9) else v for v in values]
    return records

def episode_labels(values):
    """Label every season in warm/cold runs lasting at least five seasons."""
    labels = ['Neutral'] * len(values)
    for sign, phase in [(1, 'El Niño'), (-1, 'La Niña')]:
        start = 0
        while start < len(values):
            if sign * values[start] < .5:
                start += 1
                continue
            end = start
            while end < len(values) and sign * values[end] >= .5:
                end += 1
            if end - start >= 5:
                labels[start:end] = [phase] * (end - start)
            start = end
    return labels

def read_oni_table(path):
    """Read the explicitly versioned table; compare derived phases to NOAA colors."""
    class TableParser(HTMLParser):
        def __init__(self):
            super().__init__(); self.rows=[]; self.row=[]; self.cell=None; self.color='black'
        def handle_starttag(self, tag, attrs):
            if tag=='tr': self.row=[]
            if tag=='td': self.cell=''; self.color='black'
            if self.cell is not None and tag=='span':
                style=dict(attrs).get('style','').replace(' ','').lower()
                if 'color:red' in style: self.color='red'
                elif 'color:blue' in style: self.color='blue'
        def handle_data(self, text):
            if self.cell is not None: self.cell+=text
        def handle_endtag(self, tag):
            if tag=='td' and self.cell is not None:
                self.row.append((self.cell.strip(),self.color)); self.cell=None
            if tag=='tr' and len(self.row)==13 and self.row[0][0].isdigit():
                self.rows.append(self.row); self.row=[]
    parser=TableParser(); parser.feed(path.read_text(encoding='utf-8',errors='replace'))
    names='DJF JFM FMA MAM AMJ MJJ JJA JAS ASO SON OND NDJ'.split()
    seasons=[]; published=[]
    for row in parser.rows:
        year=int(row[0][0])
        for season,(text,color) in zip(names,row[1:]):
            if not text: continue
            try: value=float(text)
            except ValueError: continue
            seasons.append((season,year,value))
            published.append({'red':'El Niño','blue':'La Niña','black':'Neutral'}[color])
    assert len(seasons)>800 and seasons[0][:2]==('DJF',1950)
    derived=episode_labels([s[2] for s in seasons])
    mismatches=[(row,actual,expected) for row,actual,expected in zip(seasons,derived,published) if 1982<=row[1]<=2025 and actual!=expected]
    assert not mismatches, f'Episode labels differ from NOAA: {mismatches}'
    return seasons,derived

def winter_values(source, state, year):
    return [source[(state, year - 1)][11], source[(state, year)][0], source[(state, year)][1]]

def weighted_temperature(values, year):
    days = [31, 31, calendar.monthrange(year, 2)[1]]
    return (sum(v * d for v, d in zip(values, days)) / sum(days) - 32) * 5 / 9

def build():
    RAW.mkdir(exist_ok=True)
    if '--download' in sys.argv:
        for name, url in FILES.items():
            urllib.request.urlretrieve(url, RAW / name)
    p = read_monthly(RAW / 'climdiv-pcpnst-v1.0.0-20261006', 1)
    t = read_monthly(RAW / 'climdiv-tmpcst-v1.0.0-20261006', 2)
    seasons, phases = read_oni_table(RAW / 'oni-v5.html')
    season_order = 'DJF JFM FMA MAM AMJ MJJ JJA JAS ASO SON OND NDJ'.split()
    indices = [year * 12 + season_order.index(season) for season, year, _ in seasons]
    assert all(b - a == 1 for a, b in zip(indices, indices[1:])), 'Nonconsecutive ONI series'
    djf = {year: (value, phases[i]) for i, (season, year, value) in enumerate(seasons) if season == 'DJF'}
    positions = {s: [x, y] for y, row in enumerate(TILES) for x, s in enumerate(row.split()) if s != '.'}
    states = [dict(code=code, name=STATE_NAMES[i], region=next(r for r, ss in REGIONS.items() if code in ss), tile=positions[code]) for i, code in enumerate(ABBREVIATIONS)]
    rows, checks = [], []
    for sid, state in enumerate(states, 1):
        winters = {}
        for year in range(1982, 2026):
            pv, tv = winter_values(p, sid, year), winter_values(t, sid, year)
            # Missing metrics remain null; the UI excludes only the active missing metric.
            winters[year] = (sum(pv) if None not in pv else None, weighted_temperature(tv, year) if None not in tv else None)
        reference = [winters[y] for y in range(1991, 2021)]
        assert all(v is not None for pair in reference for v in pair), 'Incomplete reference period'
        pbase, tbase = (sum(pair[i] for pair in reference) / 30 for i in (0, 1))
        assert pbase > 0
        for year, (precip, temp) in winters.items():
            oni, phase = djf[year]
            row = dict(id=f'{state["code"]}_{year}', state=state['code'], region=state['region'], winter=year,
                       oni=oni, phase=phase, band=sum(abs(oni) >= v for v in [.5, 1, 1.5]),
                       precip=None if precip is None else round(100 * (precip - pbase) / pbase, 5),
                       temp=None if temp is None else round(temp - tbase, 5),
                       precipInches=precip, tempC=temp, precipReferenceInches=pbase, tempReferenceC=tbase)
            rows.append(row)
            if (state['code'], year) in [('CA', 1998), ('NY', 2016), ('TX', 1984)]:
                checks.append(dict(record=row, months=[f'{year-1}-12', f'{year}-01', f'{year}-02'],
                                   precipitationInches=winter_values(p, sid, year), temperatureF=winter_values(t, sid, year),
                                   days=[31,31,calendar.monthrange(year,2)[1]]))
    assert len(rows) == 2112 and len({r['id'] for r in rows}) == len(rows)
    assert djf[1998][1] == 'El Niño' and djf[1989][1] == 'La Niña'
    data = dict(metadata=dict(title='NOAA observed winter climate', start=1982, end=2025,
        reference='Winters ending 1991–2020', retrieved='2026-10-15', release='nClimDiv 2026-10-06',
        oniMethod='Versioned ERSSTv5 historical ONI table at published 0.1 °C precision; at least five consecutive overlapping seasons at or beyond ±0.5 °C. Derived labels verified against published episode colors for every 1982–2025 season, before DJF extraction. Not RONI.',
        sources=[dict(file=name, url=url, sha256=hashlib.sha256((RAW/name).read_bytes()).hexdigest()) for name,url in FILES.items()],
        missing={metric:sum(r[metric] is None for r in rows) for metric in ['precip','temp']}), states=states, records=rows)
    (ROOT/'src'/'data.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (ROOT/'docs').mkdir(exist_ok=True)
    (ROOT/'docs'/'data-validation.json').write_text(json.dumps(dict(records=len(rows), states=len(states), winters=44, oniSeriesWinters=len(djf), publishedPhaseSeasonsVerified=528, spotChecks=checks, missing=data['metadata']['missing']), indent=2), encoding='utf-8')
    with (ROOT/'docs'/'observed-state-winters.csv').open('w', newline='', encoding='utf-8') as f:
        writer=csv.DictWriter(f, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
    print(f'Built {len(rows)} observed records. Missing metrics: {data["metadata"]["missing"]}')
    print('DJF phase counts:', {phase:sum(djf[y][1] == phase for y in range(1982,2026)) for phase in ['El Niño','La Niña','Neutral']})

if __name__ == '__main__':
    build()
