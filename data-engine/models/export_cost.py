"""
export_cost.py — 원가 계산 결과 + 시세 신호 + (브라우저 재계산용) 원본입력 내보냄
출력: web/public/data/cost.json
규칙(CLAUDE.md): 시세·환율·differential은 데이터 엔진에서만. 가정값은 사용자가 바꾸는 값.
"""
import csv
import json
import datetime as dt
from pathlib import Path

from cost_model import (
    _read_latest, _read_origins, compute, ASSUMPTIONS, LB_TO_KG, CLEAN, PROC
)

HERE = Path(__file__).resolve()
DATA_ENGINE = HERE.parents[1]
WEB_DATA = DATA_ENGINE.parent / "web" / "public" / "data"
WEB_DATA.mkdir(parents=True, exist_ok=True)
OUT = WEB_DATA / "cost.json"


def price_signal():
    path = CLEAN / "coffee_c.csv"
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as f:
        rows = sorted(csv.DictReader(f), key=lambda r: r["date"])
    prices = [float(r["close_usd_lb"]) for r in rows]
    if len(prices) < 2:
        return None
    lo, hi = min(prices), max(prices)
    cur, avg = prices[-1], sum(prices) / len(prices)
    pct = 0.5 if hi == lo else (cur - lo) / (hi - lo)
    if pct <= 0.33: label, tone = "저점권 · 구매 유리 구간", "good"
    elif pct >= 0.67: label, tone = "고점권 · 관망 또는 소량 분할", "high"
    else: label, tone = "중립권", "neutral"
    trend = "—"
    if len(prices) >= 6:
        d = prices[-1] - prices[-6]
        trend = "상승" if d > 0 else ("하락" if d < 0 else "보합")
    return {"current": round(cur,4), "low": round(lo,4), "high": round(hi,4),
            "avg": round(avg,4), "position_pct": round(pct*100,1),
            "label": label, "tone": tone, "trend": trend, "days": len(prices)}


def run():
    cc, cc_date, cc_src = _read_latest(CLEAN / "coffee_c.csv", "close_usd_lb")
    fx, fx_date, fx_src = _read_latest(CLEAN / "fx_usd_krw.csv", "usd_krw")
    origins = _read_origins()

    rows = []
    for origin, pdiff, note in origins:
        r = compute(cc, fx, pdiff)
        rows.append({"origin": origin, "note": note, "point_diff": pdiff,
                     "fob_usd_lb": r["fob_usd_lb"],
                     "green_krw_per_kg": r["green_krw_per_kg"],
                     "roasted_krw_per_kg": r["roasted_krw_per_kg"]})
    rows.sort(key=lambda x: x["green_krw_per_kg"], reverse=True)

    payload = {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "inputs": {
            "coffee_c_usd_lb": cc, "coffee_c_date": cc_date, "coffee_c_source": cc_src,
            "usd_krw": fx, "usd_krw_date": fx_date, "usd_krw_source": fx_src,
        },
        "lb_to_kg": LB_TO_KG,
        "origins": [{"origin": o, "point_diff": p, "note": n} for o, p, n in origins],
        "default_assumptions": ASSUMPTIONS,
        "signal": price_signal(),
        "assumptions": ASSUMPTIONS,
        "rows": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"내보내기 완료: {OUT}  (산지 {len(rows)}개, 브라우저 재계산용 원본 포함)")


if __name__ == "__main__":
    run()
