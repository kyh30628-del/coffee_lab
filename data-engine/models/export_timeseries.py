"""
export_timeseries.py — Coffee C + 환율 시계열을 web 차트용 JSON으로 내보냄
출력: web/public/data/timeseries.json
규칙(CLAUDE.md): clean CSV만 읽음. 날짜 교집합 기준으로 병합.
"""
import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve()
DATA_ENGINE = HERE.parents[1]
CLEAN = DATA_ENGINE / "data" / "clean"
WEB_DATA = DATA_ENGINE.parent / "web" / "public" / "data"
WEB_DATA.mkdir(parents=True, exist_ok=True)
OUT = WEB_DATA / "timeseries.json"


def read_csv(path: Path, value_col: str) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"{path.name} 없음 — 수집기를 먼저 실행하세요")
    with path.open(encoding="utf-8") as f:
        return {r["date"]: float(r[value_col]) for r in csv.DictReader(f)}


def run():
    coffee = read_csv(CLEAN / "coffee_c.csv", "close_usd_lb")
    fx = read_csv(CLEAN / "fx_usd_krw.csv", "usd_krw")

    # 두 데이터에 모두 존재하는 날짜만 (환율은 영업일, 시세도 영업일이라 대부분 겹침)
    dates = sorted(set(coffee) & set(fx))
    points = [
        {"date": d, "coffee_c": coffee[d], "usd_krw": fx[d]}
        for d in dates
    ]

    payload = {"count": len(points), "points": points}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"내보내기 완료: {OUT}")
    print(f"  {len(points)}일치 시계열 (Coffee C + 환율)")
    if points:
        print(f"  범위: {points[0]['date']} ~ {points[-1]['date']}")


if __name__ == "__main__":
    run()
