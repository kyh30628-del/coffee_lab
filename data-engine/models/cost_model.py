"""
cost_model.py — 산지별 생두 도착원가(landed cost)
관세는 산지별(origin_diff.csv tariff), 부가세는 생두 면제(0).
가정값은 업계 일반 범위의 중간값 — 사용자가 실제 견적으로 조정하는 전제.
"""
import csv
from pathlib import Path

HERE = Path(__file__).resolve()
DATA_ENGINE = HERE.parents[1]
CLEAN = DATA_ENGINE / "data" / "clean"
PROC = DATA_ENGINE / "processing"

LB_TO_KG = 2.2046

# 가정 상수 (업계 일반 범위 중간값, 추정)
ASSUMPTIONS = {
    "cif_rate": 0.08,             # 운임+보험 가산 (FOB 대비). 일반 5~12% [추정]
    "logistics_krw_per_kg": 250,  # 통관·국내물류·검사 합산 (원/kg) [추정]
    "importer_margin_rate": 0.15, # 수입사 마진 (직수입 0~, 유통 10~20%) [추정]
    "roast_loss_rate": 0.17,      # 로스팅 손실 (라이트12~다크20%, 중간17%) [추정]
}


def _read_latest(csv_path: Path, value_col: str):
    if not csv_path.exists():
        raise FileNotFoundError(f"{csv_path.name} 없음 — 수집기를 먼저 실행하세요")
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
    diff_usd_lb = point_diff / 10000.0
    fob_usd_lb = coffee_c_usd_lb + diff_usd_lb
    fob_krw_kg = fob_usd_lb * LB_TO_KG * usd_krw
    cif = fob_krw_kg * (1 + a["cif_rate"])
    after_tariff = cif * (1 + tariff)
    after_logi = after_tariff + a["logistics_krw_per_kg"]
    green = after_logi * (1 + a["importer_margin_rate"])
    roasted = green / (1 - a["roast_loss_rate"])
    return {"fob_usd_lb": round(fob_usd_lb, 4),
            "green_krw_per_kg": round(green),
            "roasted_krw_per_kg": round(roasted)}


def run():
    cc, cc_date, _ = _read_latest(CLEAN / "coffee_c.csv", "close_usd_lb")
    fx, fx_date, _ = _read_latest(CLEAN / "fx_usd_krw.csv", "usd_krw")
    origins = _read_origins()
    print(f"Coffee C {cc} USD/lb ({cc_date}) · 환율 {fx} ({fx_date})")
    print(f"{'산지':<18}{'관세':>6}{'생두₩/kg':>14}{'로스팅후₩/kg':>16}")
    print("-" * 56)
    for origin, pdiff, tariff, note in origins:
        r = compute(cc, fx, pdiff, tariff)
        print(f"{origin:<18}{int(tariff*100):>5}%{r['green_krw_per_kg']:>14,}{r['roasted_krw_per_kg']:>16,}")


if __name__ == "__main__":
    run()
