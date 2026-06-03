"""
cost_model.py — 산지별 생두 도착원가(landed cost) 계산
입력(clean): coffee_c.csv(USD/lb), fx_usd_krw.csv(원/달러), origin_diff.csv(point)
규칙(CLAUDE.md §4): 사실 상수와 가정 상수를 분리. 출처·기준일 동반 출력.
단위: origin_diff point → USD/lb = point/10000  (100 point = 1 cent/lb)
"""
import csv
from pathlib import Path

HERE = Path(__file__).resolve()
DATA_ENGINE = HERE.parents[1]
CLEAN = DATA_ENGINE / "data" / "clean"
PROC = DATA_ENGINE / "processing"

# === 사실 상수 (변경 금지) ===
LB_TO_KG = 2.2046          # 1 kg = 2.2046 lb

# === 가정 상수 (네 실제 수치로 교체. 현재는 예시 placeholder) ===
ASSUMPTIONS = {
    "cif_rate": 0.10,             # 운임·보험 가산율 (FOB 대비)  [가정]
    "tariff_rate": 0.02,          # 생두 관세율 — FTA·품목별 상이, 반드시 확인 [가정]
    "logistics_krw_per_kg": 300,  # 통관·국내물류 (원/kg)         [가정]
    "importer_margin_rate": 0.15, # 수입사 마진율                 [가정]
    "roast_loss_rate": 0.18,      # 로스팅 수율 손실 (통상 0.15~0.20) [가정]
    # 참고: 부가세 10%는 사업자 환급 대상이라 원가(COGS)에서 제외함.
}


def _read_latest(csv_path: Path, value_col: str):
    """date 기준 가장 최근 행을 반환 (clean CSV는 date 오름차순 저장됨)."""
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
    with path.open(encoding="utf-8") as f:
        return [(r["origin"], int(r["point_diff"]), r["note"]) for r in csv.DictReader(f)]


def compute(coffee_c_usd_lb, usd_krw, point_diff, a=ASSUMPTIONS):
    """단일 산지 도착원가 계산. 단계별 breakdown 포함."""
    diff_usd_lb = point_diff / 10000.0                  # point → USD/lb
    fob_usd_lb = coffee_c_usd_lb + diff_usd_lb
    fob_krw_kg = fob_usd_lb * LB_TO_KG * usd_krw         # 환산 원가 (원/kg)
    cif = fob_krw_kg * (1 + a["cif_rate"])
    after_tariff = cif * (1 + a["tariff_rate"])
    after_logi = after_tariff + a["logistics_krw_per_kg"]
    green_landed = after_logi * (1 + a["importer_margin_rate"])  # 생두 도착원가
    roasted = green_landed / (1 - a["roast_loss_rate"])          # 로스팅 후 원가
    return {
        "fob_usd_lb": round(fob_usd_lb, 4),
        "green_krw_per_kg": round(green_landed),
        "roasted_krw_per_kg": round(roasted),
    }


def run():
    cc, cc_date, cc_src = _read_latest(CLEAN / "coffee_c.csv", "close_usd_lb")
    fx, fx_date, fx_src = _read_latest(CLEAN / "fx_usd_krw.csv", "usd_krw")
    origins = _read_origins()

    print("=" * 64)
    print("산지별 생두 도착원가 추정")
    print(f"  Coffee C : {cc} USD/lb  (기준일 {cc_date}, {cc_src})")
    print(f"  환율     : {fx} 원/달러 (기준일 {fx_date}, {fx_src})")
    print(f"  가정     : {ASSUMPTIONS}")
    print("=" * 64)
    print(f"{'산지':<18}{'FOB$/lb':>10}{'생두원가₩/kg':>16}{'로스팅후₩/kg':>16}")
    print("-" * 64)
    for origin, pdiff, note in origins:
        r = compute(cc, fx, pdiff)
        print(f"{origin:<18}{r['fob_usd_lb']:>10}"
              f"{r['green_krw_per_kg']:>16,}{r['roasted_krw_per_kg']:>16,}")
    print("-" * 64)
    print("※ 가정값(CIF·관세·물류·마진·손실)은 placeholder. 실제 계약 수치로 교체할 것.")


if __name__ == "__main__":
    run()
