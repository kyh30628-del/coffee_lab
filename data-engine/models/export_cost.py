"""export_cost.py — 원가+시세신호+오늘의판단+산지별 변동(어제/7일전 대비)+재계산용 원본"""
import csv, json
import datetime as dt
from pathlib import Path
from cost_model import _read_latest, _read_origins, compute, ASSUMPTIONS, LB_TO_KG, CLEAN

HERE = Path(__file__).resolve()
DATA_ENGINE = HERE.parents[1]
WEB_DATA = DATA_ENGINE.parent / "web" / "public" / "data"
WEB_DATA.mkdir(parents=True, exist_ok=True)
OUT = WEB_DATA / "cost.json"


def _series(fname, col):
    path = CLEAN / fname
    if not path.exists(): return []
    with path.open(encoding="utf-8") as f:
        return sorted([(r["date"], float(r[col])) for r in csv.DictReader(f)], key=lambda x: x[0])


def _nth_back(series, n):
    """가장 최근에서 n칸 전 값 (없으면 가장 오래된 것)."""
    if not series: return None
    idx = max(0, len(series) - 1 - n)
    return series[idx][1]


def fx_trend():
    fx = _series("fx_usd_krw.csv", "usd_krw")
    if len(fx) < 2: return None
    return fx[-1][1] - fx[0][1]


def price_signal():
    cc = _series("coffee_c.csv", "close_usd_lb")
    prices = [v for _, v in cc]
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
    if not signal:
        return {"headline": "데이터 누적 중", "detail": "수집이 며칠 쌓이면 시세 판단이 표시됩니다.", "tone": "neutral"}
    fta = [r for r in rows if r["tariff"] == 0.0]
    fta_cheapest = min(fta, key=lambda r: r["green_krw_per_kg"]) if fta else None
    if signal["tone"] == "good": head = f"지금은 구매하기 유리한 구간입니다 (시세 {signal['label']})"
    elif signal["tone"] == "high": head = f"지금은 고가 구간 — 분할 매수나 관망을 고려하세요 (시세 {signal['label']})"
    else: head = f"시세는 중립 구간입니다 (기간 내 위치 {signal['position_pct']}%)"
    parts = [f"현재 Coffee C ${signal['current']}/lb, 추세 {signal['trend']}"]
    if fta_cheapest: parts.append(f"관세 0% 중 {fta_cheapest['origin']}이(가) 원가상 유리")
    if fxd is not None:
        parts.append("최근 환율 상승 → 원화 원가 상방 압력" if fxd > 0 else "최근 환율 하락 → 원화 원가에 우호적" if fxd < 0 else "환율 보합")
    return {"headline": head, "detail": " · ".join(parts), "tone": signal["tone"]}


def run():
    cc, cc_date, cc_src = _read_latest(CLEAN / "coffee_c.csv", "close_usd_lb")
    fx, fx_date, fx_src = _read_latest(CLEAN / "fx_usd_krw.csv", "usd_krw")
    origins = _read_origins()

    cc_series = _series("coffee_c.csv", "close_usd_lb")
    fx_series = _series("fx_usd_krw.csv", "usd_krw")
    cc_1, fx_1 = _nth_back(cc_series, 1), _nth_back(fx_series, 1)   # 어제(직전 영업일)
    cc_7, fx_7 = _nth_back(cc_series, 7), _nth_back(fx_series, 7)   # 7거래일 전

    rows = []
    for origin, pdiff, tariff, note in origins:
        r = compute(cc, fx, pdiff, tariff)
        green_now = r["green_krw_per_kg"]
        ch1 = ch7 = None
        if cc_1 and fx_1:
            g1 = compute(cc_1, fx_1, pdiff, tariff)["green_krw_per_kg"]
            if g1: ch1 = round((green_now - g1) / g1 * 100, 1)
        if cc_7 and fx_7:
            g7 = compute(cc_7, fx_7, pdiff, tariff)["green_krw_per_kg"]
            if g7: ch7 = round((green_now - g7) / g7 * 100, 1)
        rows.append({"origin": origin, "note": note, "point_diff": pdiff, "tariff": tariff,
                     "fob_usd_lb": r["fob_usd_lb"], "green_krw_per_kg": green_now,
                     "roasted_krw_per_kg": r["roasted_krw_per_kg"],
                     "change_1d": ch1, "change_7d": ch7})
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
    print(f"내보내기 완료: {OUT}  (변동 포함: 어제·7일전 대비)")
    print(f"  판단: {summary['headline']}")


if __name__ == "__main__":
    run()
