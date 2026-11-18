import { NextResponse } from "next/server";
import { z } from "zod";
import { recordEvent } from "@/lib/data/events";
import { getContext } from "@/lib/supabase/server";
import { attributeVisit, deviceClass, isBot, trackedPath } from "@/lib/tracking";

const bodySchema = z.object({
  path: z.string().max(300),
  search: z.string().max(1000).optional(),
  referrer: z.string().max(1000).optional(),
});

const done = () => new NextResponse(null, { status: 204 });

/**
 * Page-view beacon from the browser. Always answers 204: measurement is best
 * effort and a visitor never sees it fail. Only the page group, the coarse
 * source of the visit and a device class are kept.
 */
export async function POST(req: Request) {
  try {
    const ua = req.headers.get("user-agent");
    if (isBot(ua)) return done();
    const text = await req.text();
    if (text.length > 4000) return done();
    const parsed = bodySchema.safeParse(JSON.parse(text));
    if (!parsed.success) return done();
    const path = trackedPath(parsed.data.path);
    if (!path) return done();

    const { supabase } = await getContext();
    await recordEvent(supabase, "page_view", path, {
      touch: attributeVisit({
        search: parsed.data.search,
        referrer: parsed.data.referrer,
        ownHost: new URL(req.url).hostname,
      }),
      device: deviceClass(ua),
    });
  } catch {
    // ignored: see above
  }
  return done();
}
