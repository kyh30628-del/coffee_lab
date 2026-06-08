import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// 사장님 홍보 영상 업로드 — 클라이언트가 Vercel Blob에 직접 올린다(서버 본문 4.5MB 제한 회피).
// 이 라우트는 업로드 토큰만 발급(사장님 비번 검증). 완료 후 URL은 클라이언트가 owner-promo에 저장.
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        if (!clientPayload || clientPayload !== process.env.ADMIN_PASSWORD) throw new Error("unauthorized");
        return {
          allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
          maximumSizeInBytes: 300 * 1024 * 1024, // ~300MB (2~3분 영상 여유)
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => { /* 저장은 클라이언트가 owner-promo로 */ },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
