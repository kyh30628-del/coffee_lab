import { verifyReview } from "../lib/reviewQuality.ts";
import raw from "/tmp/redmoon-raw.json" with { type: "json" };

const name = "레드문 뷰티";
const areaTerms = ["도봉구", "창동"];
const addr = "서울특별시 도봉구 우이천로4다길 69 1층";

for (const [i, r] of raw.entries()) {
  const body = r.desc ?? r.text;
  const res = verifyReview({ title: r.title, body, name, areaTerms, addr, link: r.link, source: "blog" });
  console.log(i, res.verdict, res.score, JSON.stringify(res.reasons), "nameInTitle=" + res.signals.nameInTitle, "|", r.title.slice(0, 40));
}
