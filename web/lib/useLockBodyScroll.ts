"use client";
import { useEffect } from "react";

// 모달 오픈 중 배경 스크롤 락(공용) — iOS Safari는 overflow:hidden만으론 배경이 밀림(rubber-band 전파).
//   body를 position:fixed로 고정해 스크롤 자체를 원천 차단, 닫히면 원래 스크롤 위치로 복원.
// 모듈 전역 참조카운트: 중첩 모달(예: 상세 패널 안의 "전체 리뷰" 모달)이나 동시에 여러 인스턴스가
// 열려있을 때, 하나가 먼저 닫혀도 다른 하나가 열려있는 동안엔 배경 잠금이 풀리지 않아야 한다.
let lockCount = 0;
let savedScrollY = 0;
let prevStyle: { position: string; top: string; left: string; right: string; width: string; overflow: string } | null = null;

function lockBody() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    const body = document.body;
    prevStyle = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width, overflow: body.style.overflow };
    body.style.position = "fixed";
    body.style.top = `-${savedScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
  }
  lockCount++;
}

function unlockBody() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && prevStyle) {
    const body = document.body;
    body.style.position = prevStyle.position;
    body.style.top = prevStyle.top;
    body.style.left = prevStyle.left;
    body.style.right = prevStyle.right;
    body.style.width = prevStyle.width;
    body.style.overflow = prevStyle.overflow;
    window.scrollTo(0, savedScrollY);
    prevStyle = null;
  }
}

export function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    lockBody();
    return () => unlockBody();
  }, [locked]);
}
