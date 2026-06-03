"""export_cost.py — 원가+시세신호+'오늘의 판단' 요약+브라우저 재계산용 원본 내보냄"""
import csv, json
import datetime as dt
from pathlib import Path
from cost_model import _read_latest, _read_origins, compute, ASSUMPTIONS, LB_TO_KG, CLEAN

HERE = Path(__file__).resolve()
DATA_ENGINE = HERE.parents[1]
WEB_DATA = DATA_ENGINE.parent / "web" / "public" / "data"
WEB_DATA.mkdir(parents=True, exist_ok=True)
OUT = WEB_DATA / "cost.json"


def fx_trend():
    path = CLEAN / "fx_usd_krw.csv"
    if not path.exists(): return None
    with path.open(encoding="utf-8") as f:
        rows = sorted(csv.DictReader(f), key=lambda r: r["date"])
    v = [float(r["usd_krw"]) for r in rows]
    if len(v) < 2: return None
    return v[-1] - v[0]


def price_signal():
    path = CLEAN / "coffee_c.csv"
    if not path.exists(): return None
    with path.open(encoding="utf-8") as f:
        rows = sorted(csv.DictReader(f), key=lambda r: r["date"])
    prices = [float(r["close_usd_lb"]) for r in rows]
    if len(prices) < 2: return None
    lo, hi = min(prices), max(prices)
    cur, avg = prices[-1], sum(prices)/len(prices)
    pct = 0.5 if hi == lo else (cur-lo)/(hi-lo)
    if pct <= 0.33: label, tone = "저점권", "good"
    elif pct >= 0.67: label, tone = "고점권", "high"
    else: label, tone = "중립권", "neutral"
    trend = "—"
    if len(prices) >= 6:
        d = prices[-1]-prices[-6]; trend = "상승" if d>0 else ("하락" if d<0 else "보합")
    return {"current": round(cur,4), "low": round(lo,4), "high": round(hi,4),
            "avg": round(avg,4), "position_pct": round(pct*100,1),
            "label": label, "tone": tone, "trend": trend, "days": len(prices)}


def build_summary(signal, rows, fxd):
    """사장의 언어로 된 한 줄 판단."""
    if not signal:
        return {"headline": "데이터 누적 중", "detail": "수집이 며칠 쌓이면 시세 판단이 표시됩니다.", "tone": "neutral"}
    # 가장 싼 산지(생두 기준)
    cheapest = min(rows, key=lambda r: r["green_krw_per_kg"])
    fta = [r for r in rows if r["tariff"] == 0.0]
    fta_cheapest = min(fta, key=lambda r: r["green_krw_per_kg"]) if fta else None

    if signal["tone"] == "good":
        head = f"지금은 구매하기 유리한 구간입니다 (시세 {signal['label']})"
    elif signal["tone"] == "high":
        head = f"지금은 고가 구간 — 분할 매수나 관망을 고려하세요 (시세 {signal['label']})"
    else:
        head = f"시세는 중립 구간입니다 (기간 내 위치 {signal['position_pct']}%)"

    parts = []
    parts.append(f"현재 Coffee C ${signal['current']}/lb, 추세 {signal['trend']}")
    if fta_cheapest:
        parts.append(f"관세 0% 산지 중 {fta_cheapest['origin']}이(가) 원가상 유리")
    if fxd is not None:
        if fxd > 0: parts.append("최근 환율 상승 → 원화 원가 상방 압력")
        elif fxd < 0: parts.append("최근 환율 하락 → 원화 원가에 우호적")
    return {"headline": head, "detail": " · ".join(parts), "tone": signal["tone"]}


def run():
    cc, cc_date, cc_src = _read_latest(CLEAN / "coffee_c.csv", "close_usd_lb")
    fx, fx_date, fx_src = _read_latest(CLEAN / "fx_usd_krw.csv", "usd_krw")
    origins = _read_origins()
    rows = []
    for origin, pdiff, tariff, note in origins:
        r = compute(cc, fx, pdiff, tariff)
        rows.append({"origin": origin, "note": note, "point_diff": pdiff,
                     "tariff": tariff, "fob_usd_lb": r["fob_usd_lb"],
                     "green_krw_per_kg": r["green_krw_per_kg"],
                     "roasted_krw_per_kg": r["roasted_krw_per_kg"]})
    rows.sort(key=lambda x: x["green_krw_per_kg"], reverse=True)
    signal = price_signal()
    summary = build_summary(signal, rows, fx_trend())
    payload = {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "inputs": {"coffee_c_usd_lb": cc, "coffee_c_date": cc_date, "coffee_c_source": cc_src,
                   "usd_krw": fx, "usd_krw_date": fx_date, "usd_krw_source": fx_src},
        "lb_to_kg": LB_TO_KG,
        "origins": [{"origin": o, "point_diff": p, "tariff": t, "note": n} for o, p, t, n in origins],
        "default_assumptions": ASSUMPTIONS,
        "signal": signal, "summary": summary, "rows": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"내보내기 완료: {OUT}")
    print(f"  판단: {summary['headline']}")


if __name__ == "__main__":
    run()
