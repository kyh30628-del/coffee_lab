"""
export_cost.py — cost_model 결과를 web가 읽을 JSON으로 내보냄
출력: web/public/data/cost.json
규칙(CLAUDE.md): 웹은 이 JSON만 읽음. 숫자의 출처는 데이터 엔진 한 곳.
"""
import json
import datetime as dt
from pathlib import Path

from cost_model import (
    _read_latest, _read_origins, compute, ASSUMPTIONS, CLEAN, PROC
)

HERE = Path(__file__).resolve()
DATA_ENGINE = HERE.parents[1]
WEB_DATA = DATA_ENGINE.parent / "web" / "public" / "data"
WEB_DATA.mkdir(parents=True, exist_ok=True)
OUT = WEB_DATA / "cost.json"


def run():
    cc, cc_date, cc_src = _read_latest(CLEAN / "coffee_c.csv", "close_usd_lb")
    fx, fx_date, fx_src = _read_latest(CLEAN / "fx_usd_krw.csv", "usd_krw")
    origins = _read_origins()

    rows = []
    for origin, pdiff, note in origins:
        r = compute(cc, fx, pdiff)
        rows.append({
            "origin": origin,
            "note": note,
            "point_diff": pdiff,
            "fob_usd_lb": r["fob_usd_lb"],
            "green_krw_per_kg": r["green_krw_per_kg"],
            "roasted_krw_per_kg": r["roasted_krw_per_kg"],
        })
    rows.sort(key=lambda x: x["green_krw_per_kg"], reverse=True)

    payload = {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "inputs": {
            "coffee_c_usd_lb": cc, "coffee_c_date": cc_date, "coffee_c_source": cc_src,
            "usd_krw": fx, "usd_krw_date": fx_date, "usd_krw_source": fx_src,
        },
        "assumptions": ASSUMPTIONS,
        "rows": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"내보내기 완료: {OUT}")
    print(f"  {len(rows)}개 산지 · 기준 Coffee C {cc} USD/lb / 환율 {fx}")


if __name__ == "__main__":
    run()
