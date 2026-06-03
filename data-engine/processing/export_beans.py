"""
export_beans.py — beans.csv를 산지×가공으로 집계해 web 추천용 JSON 출력
출력: web/public/data/beans.json
규칙(CLAUDE.md): clean만 읽음. CQI 편향 고려해 상대위치(정규화)값 사용.
표본 적은 조합(n<3) 제외해 노이즈 감소.
"""
import json
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve()
DATA_ENGINE = HERE.parents[1]
CLEAN = DATA_ENGINE / "data" / "clean"
WEB_DATA = DATA_ENGINE.parent / "web" / "public" / "data"
WEB_DATA.mkdir(parents=True, exist_ok=True)
OUT = WEB_DATA / "beans.json"

MIN_SAMPLES = 3


def run():
    df = pd.read_csv(CLEAN / "beans.csv")
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

    beans = [
        {
            "origin": r.origin,
            "process": r.process,
            "acidity": round(r.acidity, 3),
            "body": round(r.body, 3),
            "sweetness": round(r.sweetness, 3),
            "cup_total": round(r.cup_total, 2),
            "samples": int(r.n),
        }
        for r in grouped.itertuples()
    ]
    beans.sort(key=lambda b: b["cup_total"], reverse=True)

    OUT.write_text(json.dumps({"count": len(beans), "beans": beans},
                              ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"내보내기 완료: {OUT}")
    print(f"  {len(beans)}개 산지×가공 조합 (표본 {MIN_SAMPLES}종 이상)")


if __name__ == "__main__":
    run()
