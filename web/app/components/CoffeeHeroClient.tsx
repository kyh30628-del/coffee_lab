"use client";
import dynamic from "next/dynamic";

const CoffeeHero = dynamic(() => import("./CoffeeHero"), {
  ssr: false,
  loading: () => <div style={{ aspectRatio: "1 / 1", maxHeight: 580 }} />,
});

export default function CoffeeHeroClient() {
  return <CoffeeHero />;
}
