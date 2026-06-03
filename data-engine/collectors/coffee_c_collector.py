"""
coffee_c_collector.py — ICE Coffee C (아라비카) 선물 일별 가격 수집기
출처: Yahoo Finance KC=F (ICE Futures, 지연시세). 단위 원본=USX(센트/lb) → USD/lb로 정규화.
규칙(CLAUDE.md): raw 보존 → 정제 → clean 적재, 멱등, 재시도, 출처·기준일 동반.
주의: KC=F 가격은 센트/파운드(USX). USD/lb 로 쓰려면 /100.
"""
import csv
import json
import time
import datetime as dt
from pathlib import Path

import yfinance as yf

HERE = Path(__file__).resolve()
DATA_ENGINE = HERE.parents[1]
RAW_DIR = DATA_ENGINE / "data" / "raw"
CLEAN_DIR = DATA_ENGINE / "data" / "clean"
RAW_DIR.mkdir(parents=True, exist_ok=True)
CLEAN_DIR.mkdir(parents=True, exist_ok=True)

TICKER = "KC=F"
SOURCE = "Yahoo Finance KC=F (ICE Coffee C, delayed)"
CLEAN_CSV = CLEAN_DIR / "coffee_c.csv"


def fetch(period: str = "1mo", retries: int = 3):
    """yfinance로 일별 OHLC 다운로드. 실패 시 재시도. DataFrame 반환."""
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            df = yf.download(TICKER, period=period, interval="1d",
                             progress=False, auto_adjust=False)
            if df is None or df.empty:
                raise RuntimeError("빈 응답")
            return df
        except Exception as e:
            last_err = e
            print(f"  시도 {attempt}/{retries} 실패: {e}")
            time.sleep(2 * attempt)
    raise RuntimeError(f"yfinance 호출 실패: {last_err}")


def save_raw(df) -> Path:
    """원본을 CSV로 보존 (감사용)."""
    ts = dt.datetime.now().strftime("%Y%m%dT%H%M%S")
    path = RAW_DIR / f"coffee_c_yf_{ts}.csv"
    df.to_csv(path)
    return path


def parse(df) -> list[dict]:
    """DataFrame → [{date, close_usd_lb, source}]. USX→USD/lb (/100)."""
    out = []
    closes = df["Close"]
    # yfinance가 멀티컬럼으로 줄 때 대비
    if hasattr(closes, "columns"):
        closes = closes.iloc[:, 0]
    for idx, val in closes.items():
        if val is None:
            continue
        try:
            usx = float(val)
        except (TypeError, ValueError):
            continue
        date_iso = idx.strftime("%Y-%m-%d")
        out.append({
            "date": date_iso,
            "close_usd_lb": round(usx / 100.0, 4),  # 센트/lb → USD/lb
            "source": SOURCE,
        })
    return out


def load_existing() -> dict:
    if not CLEAN_CSV.exists():
        return {}
    with CLEAN_CSV.open(encoding="utf-8") as f:
        return {r["date"]: r for r in csv.DictReader(f)}


def write_clean(merged: dict):
    rows = sorted(merged.values(), key=lambda r: r["date"])
    with CLEAN_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["date", "close_usd_lb", "source"])
        w.writeheader()
        w.writerows(rows)


def run(period: str = "1mo"):
    print(f"[coffee_c_collector] 최근 {period} KC=F 수집 중...")
    df = fetch(period)
    raw_path = save_raw(df)
    print(f"  raw 저장: {raw_path.name}")

    new_rows = parse(df)
    if not new_rows:
        print("  ⚠️ 유효 데이터 없음")
        return

    merged = load_existing()
    for r in new_rows:
        merged[r["date"]] = r          # 멱등
    write_clean(merged)

    latest = max(new_rows, key=lambda r: r["date"])
    print(f"  적재 완료: 총 {len(merged)}건")
    print(f"  최신: {latest['date']} → {latest['close_usd_lb']} USD/lb  (출처: {SOURCE})")


if __name__ == "__main__":
    run()
