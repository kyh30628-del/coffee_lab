"""
fx_collector.py — ECOS 원/달러 환율 수집기
출처: ECOS(한국은행) 통계표 731Y001 / 항목 0000001 (원/미국달러 매매기준율)
규칙(CLAUDE.md): raw 보존 → 정제 → clean 적재, 멱등, 재시도, 출처·기준일 동반
"""
import os
import csv
import json
import time
import datetime as dt
from pathlib import Path

import requests
from dotenv import load_dotenv

# --- 경로 설정 (이 파일 기준으로 프로젝트 루트 탐색) ---
HERE = Path(__file__).resolve()
DATA_ENGINE = HERE.parents[1]          # data-engine/
RAW_DIR = DATA_ENGINE / "data" / "raw"
CLEAN_DIR = DATA_ENGINE / "data" / "clean"
RAW_DIR.mkdir(parents=True, exist_ok=True)
CLEAN_DIR.mkdir(parents=True, exist_ok=True)

# .env 는 프로젝트 루트(data-engine의 상위)에 있음
load_dotenv(DATA_ENGINE.parent / ".env")
ECOS_API_KEY = os.getenv("ECOS_API_KEY")

# --- ECOS 규격 상수 (CLAUDE.md §3-1) ---
STAT_CODE = "731Y001"   # 주요국 통화의 대원화 환율
ITEM_CODE = "0000001"   # 원/미국달러(매매기준율)
CYCLE = "D"             # 일별
SOURCE = "ECOS(한국은행) 731Y001/0000001"
BASE = "https://ecos.bok.or.kr/api/StatisticSearch"

CLEAN_CSV = CLEAN_DIR / "fx_usd_krw.csv"


def fetch(start: str, end: str, retries: int = 3) -> dict:
    """ECOS 호출. 실패 시 재시도. 원본 JSON 반환."""
    if not ECOS_API_KEY:
        raise RuntimeError(".env 의 ECOS_API_KEY 가 비어있음")
    url = f"{BASE}/{ECOS_API_KEY}/json/kr/1/100/{STAT_CODE}/{CYCLE}/{start}/{end}/{ITEM_CODE}"
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, timeout=10)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last_err = e
            print(f"  시도 {attempt}/{retries} 실패: {e}")
            time.sleep(2 * attempt)
    raise RuntimeError(f"ECOS 호출 실패: {last_err}")


def save_raw(payload: dict) -> Path:
    """원본 응답을 타임스탬프로 보존 (감사용)."""
    ts = dt.datetime.now().strftime("%Y%m%dT%H%M%S")
    path = RAW_DIR / f"fx_ecos_{ts}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def parse(payload: dict) -> list[dict]:
    """ECOS 응답 → [{date, usd_krw, source}] 정제."""
    # 오류 응답 처리 (ECOS는 RESULT 키로 에러를 반환)
    if "RESULT" in payload:
        raise RuntimeError(f"ECOS 오류: {payload['RESULT']}")
    rows = payload.get("StatisticSearch", {}).get("row", [])
    out = []
    for row in rows:
        time_str = row.get("TIME")          # 'YYYYMMDD'
        val = row.get("DATA_VALUE")
        if not time_str or val in (None, "", "-"):
            continue                         # 결측(주말·공휴일) 스킵
        date_iso = f"{time_str[0:4]}-{time_str[4:6]}-{time_str[6:8]}"
        out.append({"date": date_iso, "usd_krw": float(val), "source": SOURCE})
    return out


def load_existing() -> dict:
    """기존 clean CSV를 date->row 로 읽어 멱등 병합 준비."""
    if not CLEAN_CSV.exists():
        return {}
    with CLEAN_CSV.open(encoding="utf-8") as f:
        return {r["date"]: r for r in csv.DictReader(f)}


def write_clean(merged: dict):
    """date 기준 정렬해 clean CSV 저장."""
    rows = sorted(merged.values(), key=lambda r: r["date"])
    with CLEAN_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["date", "usd_krw", "source"])
        w.writeheader()
        w.writerows(rows)


def run(days_back: int = 10):
    """최근 days_back 일 범위 수집 → 멱등 병합."""
    today = dt.date.today()
    start = (today - dt.timedelta(days=days_back)).strftime("%Y%m%d")
    end = today.strftime("%Y%m%d")
    print(f"[fx_collector] {start} ~ {end} 수집 중...")

    payload = fetch(start, end)
    raw_path = save_raw(payload)
    print(f"  raw 저장: {raw_path.name}")

    new_rows = parse(payload)
    if not new_rows:
        print("  ⚠️ 유효 데이터 없음 (범위 내 영업일 환율 미존재 가능)")
        return

    merged = load_existing()
    for r in new_rows:
        merged[r["date"]] = r            # 같은 날짜는 덮어씀 = 멱등
    write_clean(merged)

    latest = max(new_rows, key=lambda r: r["date"])
    print(f"  적재 완료: 총 {len(merged)}건")
    print(f"  최신: {latest['date']} → {latest['usd_krw']} 원/달러  (출처: {SOURCE})")


if __name__ == "__main__":
    run()
