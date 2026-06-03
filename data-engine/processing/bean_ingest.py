"""
bean_ingest.py — CQI 큐핑 데이터 다운로드 + 6축 전처리 → 원두 카탈로그
출처: github jldbc/coffee-quality-database arabica_data_cleaned.csv (CQI, CLAUDE.md §3-4)
규칙: raw 보존 → 정제 → clean 적재. CQI는 80점+ 편향이라 절대점수 아닌 상대위치로 변환.
산출: data/clean/beans.csv  (산지/품종/가공 + 6축 0~1 정규화)
"""
import io
import datetime as dt
from pathlib import Path

import pandas as pd
import requests

HERE = Path(__file__).resolve()
DATA_ENGINE = HERE.parents[1]
RAW_DIR = DATA_ENGINE / "data" / "raw"
CLEAN_DIR = DATA_ENGINE / "data" / "clean"
RAW_DIR.mkdir(parents=True, exist_ok=True)
CLEAN_DIR.mkdir(parents=True, exist_ok=True)

URL = "https://raw.githubusercontent.com/jldbc/coffee-quality-database/master/data/arabica_data_cleaned.csv"
SOURCE = "CQI via jldbc/coffee-quality-database (arabica_data_cleaned)"
OUT = CLEAN_DIR / "beans.csv"


def download() -> pd.DataFrame:
    print("[bean_ingest] CQI 데이터 다운로드 중...")
    r = requests.get(URL, timeout=30)
    r.raise_for_status()
    # raw 원본 보존
    ts = dt.datetime.now().strftime("%Y%m%dT%H%M%S")
    raw_path = RAW_DIR / f"cqi_arabica_{ts}.csv"
    raw_path.write_text(r.text, encoding="utf-8")
    print(f"  raw 저장: {raw_path.name}")
    return pd.read_csv(io.StringIO(r.text))


def minmax(s: pd.Series) -> pd.Series:
    """0~1 정규화. 분포 내 상대 위치 (CQI 절대점수 편향 보정)."""
    lo, hi = s.min(), s.max()
    if hi == lo:
        return s * 0 + 0.5
    return (s - lo) / (hi - lo)


def transform(df: pd.DataFrame) -> pd.DataFrame:
    # 컬럼명 표준화 (점 표기 → 스네이크)
    df = df.rename(columns={
        "Country.of.Origin": "origin",
        "Variety": "variety",
        "Processing.Method": "process",
        "Acidity": "acidity_raw",
        "Body": "body_raw",
        "Sweetness": "sweetness_raw",
        "Aroma": "aroma_raw",
        "Flavor": "flavor_raw",
        "Aftertaste": "aftertaste_raw",
        "Total.Cup.Points": "cup_total",
    })

    keep = ["origin", "variety", "process",
            "acidity_raw", "body_raw", "sweetness_raw",
            "aroma_raw", "flavor_raw", "aftertaste_raw", "cup_total"]
    df = df[[c for c in keep if c in df.columns]].copy()

    # 결측·이상치 처리
    df = df.dropna(subset=["origin"])
    for col in ["acidity_raw", "body_raw", "sweetness_raw"]:
        df = df[df[col].notna() & (df[col] > 0)]   # 0점(미평가) 제거
    df["variety"] = df["variety"].fillna("정보없음")
    df["process"] = df["process"].fillna("정보없음")

    # 6축 정규화 (분포 내 상대 위치)
    df["acidity"] = minmax(df["acidity_raw"]).round(3)
    df["body"] = minmax(df["body_raw"]).round(3)
    df["sweetness"] = minmax(df["sweetness_raw"]).round(3)

    out = df[["origin", "variety", "process",
              "acidity", "body", "sweetness", "cup_total"]].copy()
    out["source"] = SOURCE
    out = out.reset_index(drop=True)
    return out


def run():
    df = download()
    out = transform(df)
    out.to_csv(OUT, index=False, encoding="utf-8")
    print(f"  적재 완료: {OUT}  ({len(out)}종)")
    print(f"  산지 수: {out['origin'].nunique()}개")
    print("  미리보기:")
    print(out.head(5).to_string(index=False))


if __name__ == "__main__":
    run()
