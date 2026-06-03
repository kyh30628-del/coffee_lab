"""
export_beans.py — beans.csv를 산지×가공으로 집계 + 산지별 향 경향 부착 → 추천용 JSON
출력: web/public/data/beans.json
규칙(CLAUDE.md): 산미·바디·단맛은 CQI 실데이터(정규화). 향은 origin_flavor.csv 경향(추정).
"""
import csv
import json
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve()
DATA_ENGINE = HERE.parents[1]
CLEAN = DATA_ENGINE / "data" / "clean"
PROC = DATA_ENGINE / "processing"
WEB_DATA = DATA_ENGINE.parent / "web" / "public" / "data"
WEB_DATA.mkdir(parents=True, exist_ok=True)
OUT = WEB_DATA / "beans.json"

MIN_SAMPLES = 3


def load_flavor_map():
    path = PROC / "origin_flavor.csv"
    m = {}
    with path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            m[row["origin_key"].lower()] = row["flavors"].split(";")
    return m


def flavors_for(origin, fmap):
    o = str(origin).lower()
    for key, fams in fmap.items():
        if key in o:                 # 부분 일치 (예: 'Tanzania, ...' 도 매칭)
            return fams
    return []


def run():
    df = pd.read_csv(CLEAN / "beans.csv")
    fmap = load_flavor_map()

    grouped = (
        df.groupby(["origin", "process"])
          .agg(acidity=("acidity", "mean"),
               body=("body", "mean"),
               sweetness=("sweetness", "mean"),
               cup_total=("cup_total", "mean"),
               n=("origin", "size"))
          .reset_index()
    )
    grouped = grouped[grouped["n"] >= MIN_SAMPLES]

    beans = []
    for r in grouped.itertuples():
        beans.append({
            "origin": r.origin,
            "process": r.process,
            "acidity": round(r.acidity, 3),
            "body": round(r.body, 3),
            "sweetness": round(r.sweetness, 3),
            "cup_total": round(r.cup_total, 2),
            "samples": int(r.n),
            "flavors": flavors_for(r.origin, fmap),
        })
    beans.sort(key=lambda b: b["cup_total"], reverse=True)

    OUT.write_text(json.dumps({"count": len(beans), "beans": beans},
                              ensure_ascii=False, indent=2), encoding="utf-8")
    tagged = sum(1 for b in beans if b["flavors"])
    print(f"내보내기 완료: {OUT}")
    print(f"  {len(beans)}개 조합 · 향 태그 부착 {tagged}개")


if __name__ == "__main__":
    run()
