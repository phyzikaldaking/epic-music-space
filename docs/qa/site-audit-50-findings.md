# Site Audit: 50 concrete issues found (apps/web)

Source: `npm run -s lint --workspace apps/web` on 2026-05-15.

1. `apps/web/src/app/admin/AdminSongsClient.tsx:56:26` — setState-in-effect cascade risk.
2. `apps/web/src/app/admin/AdminUsersClient.tsx:73:10` — setState-in-effect cascade risk.
3. `apps/web/src/app/admin/finance/page.tsx:35:26` — impure `Date.now()` during render.
4. `apps/web/src/app/admin/finance/page.tsx:75:24` — impure `Date.now()` during render.
5. `apps/web/src/app/admin/reports/AdminReportsClient.tsx:44:10` — setState-in-effect cascade risk.
6. `apps/web/src/app/admin/status/page.tsx:101:29` — impure `Date.now()` during render.
7. `apps/web/src/app/api/ai/cover-art/route.ts:3:10` — unused `prisma` import.
8. `apps/web/src/app/api/studio/battles/[id]/leaderboard/route.ts:1:23` — unused `NextResponse` import.
9. `apps/web/src/app/api/studio/battles/[id]/leaderboard/route.ts:2:10` — unused `auth` import.
10. `apps/web/src/app/api/studio/battles/route.ts:1:23` — unused `NextResponse` import.
11. `apps/web/src/app/api/studio/battles/submit/route.ts:1:23` — unused `NextResponse` import.
12. `apps/web/src/app/api/studio/drafts/comments/route.ts:1:23` — unused `NextResponse` import.
13. `apps/web/src/app/api/studio/export/video/route.ts:1:23` — unused `NextResponse` import.
14. `apps/web/src/app/api/studio/export/video/route.ts:36:45` — unused `width` variable.
15. `apps/web/src/app/api/studio/export/video/route.ts:36:59` — unused `height` variable.
16. `apps/web/src/app/api/studio/export/video/route.ts:46:47` — explicit `any` type.
17. `apps/web/src/app/api/studio/export/video/route.ts:86:11` — unused `audioBuffer` variable.
18. `apps/web/src/app/api/studio/heartbeat/route.ts:18:28` — unused `req` arg.
19. `apps/web/src/app/api/studio/heartbeat/route.ts:42:30` — unused `req` arg.
20. `apps/web/src/app/api/studio/jam/create/route.ts:1:23` — unused `NextResponse` import.
21. `apps/web/src/app/api/studio/jam/join/route.ts:1:23` — unused `NextResponse` import.
22. `apps/web/src/app/api/studio/loops/smart-suggest/route.ts:1:23` — unused `NextResponse` import.
23. `apps/web/src/app/api/studio/loops/smart-suggest/route.ts:9:13` — unused `key` variable.
24. `apps/web/src/app/api/studio/loops/smart-suggest/route.ts:9:24` — unused `bpm` variable.
25. `apps/web/src/app/api/studio/projects/[id]/route.ts:73:21` — explicit `any` type.
26. `apps/web/src/app/api/studio/projects/route.ts:1:23` — unused `NextResponse` import.
27. `apps/web/src/app/api/studio/projects/route.ts:53:21` — explicit `any` type.
28. `apps/web/src/app/api/studio/remix/generate/route.ts:1:23` — unused `NextResponse` import.
29. `apps/web/src/app/api/studio/samples/vibe-match/route.ts:1:23` — unused `NextResponse` import.
30. `apps/web/src/app/api/studio/samples/vibe-match/route.ts:26:13` — unused `sourceGenre` variable.
31. `apps/web/src/app/api/studio/samples/vibe-match/route.ts:26:35` — unused `sourceBpm` variable.
32. `apps/web/src/app/api/studio/samples/vibe-match/route.ts:26:52` — unused `sourceKey` variable.
33. `apps/web/src/app/api/studio/tiktok/extract/route.ts:1:23` — unused `NextResponse` import.
34. `apps/web/src/app/api/studio/vocal/detect-key/route.ts:1:23` — unused `NextResponse` import.
35. `apps/web/src/app/api/studio/vocal/harmonies/route.ts:1:23` — unused `NextResponse` import.
36. `apps/web/src/app/api/studio/vocal/harmonies/route.ts:25:22` — unused `harmonyCount` variable.
37. `apps/web/src/app/api/studio/vocal/transpose/route.ts:1:23` — unused `NextResponse` import.
38. `apps/web/src/app/auctions/[id]/page.tsx:80:5` — setState-in-effect cascade risk.
39. `apps/web/src/app/auctions/page.tsx:72:5` — setState-in-effect cascade risk.
40. `apps/web/src/app/auth/magic-link/MagicLinkClient.tsx:27:7` — setState-in-effect cascade risk.
41. `apps/web/src/app/auth/signin/SignInForm.tsx:61:5` — setState-in-effect cascade risk.
42. `apps/web/src/app/auth/signup/SignUpForm.tsx:99:5` — setState-in-effect cascade risk.
43. `apps/web/src/app/auth/signup/SignUpForm.tsx:108:50` — setState-in-effect cascade risk.
44. `apps/web/src/app/auth/verify-email/page.tsx:29:5` — setState-in-effect cascade risk.
45. `apps/web/src/app/dashboard/page.tsx:105:56` — impure `Date.now()` during render.
46. `apps/web/src/app/dashboard/page.tsx:290:64` — impure `Date.now()` during render.
47. `apps/web/src/app/dashboard/payouts/page.tsx:173:15` — impure `Date.now()` during render.
48. `apps/web/src/app/dashboard/services/page.tsx:69:38` — impure `Date.now()` during render.
49. `apps/web/src/components/daw/RecoverableTakesModal.tsx:57:5` — setState-in-effect cascade risk.
50. `apps/web/src/components/daw/RemixGenerator.tsx:42:62` — explicit `any` type.

There are more than 50 additional issues in the same lint run (`240` total problems).
