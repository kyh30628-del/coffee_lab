"""
cost_model.py — 산지별 생두 도착원가(landed cost) 계산
입력: coffee_c.csv(USD/lb), fx_usd_krw.csv(원/달러), origin_diff.csv(point+산지별 관세)
규칙(CLAUDE.md §4): 사실/가정 상수 분리. 관세는 산지별(FTA) 차등. 부가세는 생두 면제(0).
단위: point → USD/lb = point/10000
"""
import csv
from pathlib import Path

HERE = Path(__file__).resolve()
DATA_ENGINE = HERE.parents[1]
CLEAN = DATA_ENGINE / "data" / "clean"
PROC = DATA_ENGINE / "processing"

# === 사실 상수 ===
LB_TO_KG = 2.2046

# === 가정 상수 (실제값으로 교체 가능) ===
ASSUMPTIONS = {
    "cif_rate": 0.10,             # 운임·보험 가산율 [가정]
    "logistics_krw_per_kg": 300,  # 통관·국내물류 (원/kg) [가정]
    "importer_margin_rate": 0.15, # 수입사 마진율 [가정]
    "roast_loss_rate": 0.18,      # 로스팅 손실 (0.15~0.20) [가정]
    # 관세는 산지별(origin_diff.csv의 tariff)로 적용. 부가세는 생두 면제(0).
}


def _read_latest(csv_path: Path, value_col: str):
    if not csv_path.exists():
        raise FileNotFoundError(f"{csv_path.name} 없음 — 먼저 수집기를 실행하세요")
    with csv_path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise RuntimeError(f"{csv_path.name} 비어있음")
    latest = max(rows, key=lambda r: r["date"])
    return float(latest[value_col]), latest["date"], latest["source"]


def _read_origins():
    path = PROC / "origin_diff.csv"
    if not path.exists():
        raise FileNotFoundError("origin_diff.csv 없음")
    out = []
    with path.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            out.append((r["origin"], int(r["point_diff"]),
                        float(r.get("tariff", 0.02)), r["note"]))
    return out


def compute(coffee_c_usd_lb, usd_krw, point_diff, tariff, a=ASSUMPTIONS):
    """단일 산지 도착원가. tariff는 산지별 관세율."""
    diff_usd_lb = point_diff / 10000.0
    fob_usd_lb = coffee_c_usd_lb + diff_usd_lb
    fob_krw_kg = fob_usd_lb * LB_TO_KG * usd_krw
    cif = fob_krw_kg * (1 + a["cif_rate"])
    after_tariff = cif * (1 + tariff)                 # 산지별 관세
    after_logi = after_tariff + a["logistics_krw_per_kg"]
    green = after_logi * (1 + a["importer_margin_rate"])
    roasted = green / (1 - a["roast_loss_rate"])
    return {"fob_usd_lb": round(fob_usd_lb, 4),
            "green_krw_per_kg": round(green),
            "roasted_krw_per_kg": round(roasted)}


def run():
    cc, cc_date, cc_src = _read_latest(CLEAN / "coffee_c.csv", "close_usd_lb")
    fx, fx_date, fx_src = _read_latest(CLEAN / "fx_usd_krw.csv", "usd_krw")
    origins = _read_origins()
    print(f"Coffee C {cc} USD/lb ({cc_date}) · 환율 {fx} ({fx_date})")
    print(f"{'산지':<18}{'관세':>6}{'생두₩/kg':>14}{'로스팅후₩/kg':>16}")
    print("-" * 56)
    for origin, pdiff, tariff, note in origins:
        r = compute(cc, fx, pdiff, tariff)
        print(f"{origin:<18}{int(tariff*100):>5}%{r['green_krw_per_kg']:>14,}{r['roasted_krw_per_kg']:>16,}")


if __name__ == "__main__":
    run()
