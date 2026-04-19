import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { chatWithAssistant } from "@/lib/ai";
import { z } from "zod";
const schema = z.object({
    messages: z
        .array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
    }))
        .min(1)
        .max(20),
});
export async function POST(req) {
    var _a, _b;
    const session = await auth();
    if (!((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: (_b = parsed.error.issues[0]) === null || _b === void 0 ? void 0 : _b.message }, { status: 400 });
    }
    const reply = await chatWithAssistant(parsed.data.messages);
    return NextResponse.json({ reply });
}
