import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { strictLimiter, withRateLimit } from "@/lib/rateLimit";
export const runtime = "nodejs";
const handler = async (request: NextRequest) => {
 const session=await auth(); if(!session?.user?.id) return NextResponse.json({error:"Sign in to use HQ."},{status:401});
 const body=await request.json().catch(()=>({})) as {message?:string;song?:Record<string,unknown>}; const message=body.message?.trim();
 if(!message||message.length>4000) return NextResponse.json({error:"Message must be between 1 and 4000 characters."},{status:400});
 if(!process.env.OPENAI_API_KEY) return NextResponse.json({error:"HQ is temporarily unavailable."},{status:503});
 const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
 const response=await client.responses.create({model:process.env.MUSIC_CONSULTANT_MODEL ?? "gpt-5-mini",input:[{role:"system",content:"You are HQ, Epic Music Space music-business workflow assistant. Give concise educational guidance. Distinguish composition, sound recording, performance, mechanical, neighboring, sync, and master-owner rights. Never claim to register a work, collect royalties, provide legal/tax/financial advice, or guarantee payment. Direct users to official portals and ask for missing ownership, writer split, publisher, IPI/ISRC, release, and territory details. ASCAP and BMI are alternative U.S. PRO choices for the same writer role."},{role:"user",content:JSON.stringify({message,song:body.song ?? {}})}]});
 return NextResponse.json({answer:response.output_text});
};
export async function POST(request:NextRequest){ return withRateLimit(strictLimiter,handler,{keyFor:async()=>{const session=await auth();return session?.user?.id ?? null;}})(request); }