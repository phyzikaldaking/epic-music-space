import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getDemoTracks } from "@/lib/demoTracks";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: { id: string } }) {
  let title = "Epic Music Space";
  let artist = "Independent music marketplace";
  let coverUrl: string | null = null;
  let licensePrice: number | null = null;

  try {
    const song = await prisma.song.findUnique({
      where: { id: params.id },
      select: { title: true, artist: true, coverUrl: true, licensePrice: true },
    });
    if (song) {
      title = song.title;
      artist = song.artist;
      coverUrl = song.coverUrl ?? null;
      licensePrice = Number(song.licensePrice);
    } else {
      const demos = await getDemoTracks();
      const demo = demos.find((d) => d.id === params.id);
      if (demo) {
        title = demo.title;
        artist = demo.artist;
        coverUrl = demo.coverUrl ?? null;
        licensePrice = Number(demo.licensePrice);
      }
    }
  } catch {
    /* fall through to defaults */
  }

  return new ImageResponse(
    (
      <div tw="flex h-full w-full bg-[linear-gradient(135deg,#0a0a14_0%,#1a0f2e_50%,#0a0a14_100%)] p-[60px] text-white">
        {coverUrl && (
          <img
            src={coverUrl}
            alt=""
            width={500}
            height={500}
            tw="mr-[60px] rounded-[32px] object-cover shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
          />
        )}
        <div tw="flex flex-1 flex-col justify-between">
          <div tw="flex items-center gap-3">
            <div tw="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#6c5ce780] bg-[#6c5ce740] text-[20px] text-cyan-300">
              ♫
            </div>
            <span tw="text-[22px] font-extrabold tracking-[-0.4px] text-violet-300">
              Epic Music Space
            </span>
          </div>

          <div tw="flex flex-col">
            <div tw="mb-4 text-[64px] font-black leading-[1.05] tracking-[-2px]">{title}</div>
            <div tw="text-[32px] text-white/65">by {artist}</div>
          </div>

          <div tw="flex items-center gap-4">
            {licensePrice !== null && (
              <div tw="rounded-full border border-[#6c5ce773] bg-[#6c5ce72e] px-[18px] py-[10px] text-[22px] font-bold text-violet-300">
                License from ${licensePrice.toFixed(0)}
              </div>
            )}
            <div tw="text-[18px] text-white/45">
              Listen, license, and own — epicmusicspace.com
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
