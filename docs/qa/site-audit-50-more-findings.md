# Site Audit: 50 more issues found (apps/web)

Source: `npm run -s lint --workspace apps/web` on 2026-05-15.

1. `apps/web/src/app/auth/magic-link/MagicLinkClient.tsx:27:5` — setState in effect (`setStatus`) cascade risk.
2. `apps/web/src/app/dashboard/wallet/page.tsx:112:24` — impure `Date.now()` during render.
3. `apps/web/src/app/explore/ExploreClient.tsx:93:5` — setState in effect (`setPosts`) cascade risk.
4. `apps/web/src/app/feed/FeedClient.tsx:110:5` — setState in effect (`setPosts`) cascade risk.
5. `apps/web/src/app/global-error.tsx:1:1` — unused eslint-disable directive.
6. `apps/web/src/app/global-error.tsx:28:14` — unused variable `e`.
7. `apps/web/src/app/market/artist/[id]/page.tsx:61:23` — impure `Date.now()` during render.
8. `apps/web/src/app/market/bookings/[id]/page.tsx:47:36` — impure `Date.now()` during render.
9. `apps/web/src/app/market/verses/[id]/VerseBookFlow.tsx:51:35` — impure `Date.now()` during render.
10. `apps/web/src/app/messages/[id]/ThreadClient.tsx:60:10` — setState in effect via `load()`.
11. `apps/web/src/app/notifications/page.tsx:104:7` — setState in effect (`setLoading`) cascade risk.
12. `apps/web/src/app/pricing/PricingClient.tsx:173:9` — immutability rule violation (`window.location.href`).
13. `apps/web/src/app/profile/edit/page.tsx:116:5` — setState in effect (`setPhoneChallengeExpiresAt`).
14. `apps/web/src/app/profile/edit/page.tsx:122:7` — setState in effect (`setPhoneChallengeSecondsLeft`).
15. `apps/web/src/app/rooms/[id]/RoomClient.tsx:428:5` — setState in effect (`setPageVisible`).
16. `apps/web/src/app/rooms/[id]/RoomClient.tsx:1276:10` — setState in effect via `grantFloor()`.
17. `apps/web/src/app/search/SearchClient.tsx:94:7` — setState in effect (`setResults`).
18. `apps/web/src/app/share/[token]/page.tsx:60:72` — impure `Date.now()` during render.
19. `apps/web/src/app/studio/[username]/page.tsx:376:15` — impure `Date.now()` during render.
20. `apps/web/src/app/studio/[username]/stats/page.tsx:49:27` — impure `Date.now()` during render.
21. `apps/web/src/app/studio/[username]/stats/page.tsx:50:28` — impure `Date.now()` during render.
22. `apps/web/src/app/studio/beat-machine/BeatMachineClient.tsx:40:32` — explicit `any` type.
23. `apps/web/src/app/studio/beat-machine/BeatMachineClient.tsx:94:177` — unused expression.
24. `apps/web/src/components/daw/ProducerBattleMode.tsx:32:10` — unused variable `battles`.
25. `apps/web/src/components/daw/ProductionTimeline.tsx:138:11` — `<img>` instead of `next/image`.
26. `apps/web/src/components/daw/ProjectMenu.tsx:64:5` — setState in effect (`setName`).
27. `apps/web/src/components/daw/SampleChopperModal.tsx:33:7` — setState in effect (`setBuffer`).
28. `apps/web/src/components/daw/SendClipToDmButton.tsx:41:5` — setState in effect (`setLoading`).
29. `apps/web/src/components/daw/SendClipToDmButton.tsx:70:18` — impure `Date.now()` during render path.
30. `apps/web/src/components/daw/SpotlightTour.tsx:31:31` — setState in effect (`setIndex`).
31. `apps/web/src/components/daw/SpotlightTour.tsx:50:16` — setState in effect (`setMissing`).
32. `apps/web/src/components/daw/StemLoopBrowser.tsx:79:10` — setState in effect via `load()`.
33. `apps/web/src/components/daw/StemSeparationModal.tsx:14:6` — unused type `Stem`.
34. `apps/web/src/components/daw/StudioVideoCollab.tsx:192:6` — missing effect dependency `leaveVideoRoom`.
35. `apps/web/src/components/daw/TakeBrowserModal.tsx:126:3` — unused arg `trackId`.
36. `apps/web/src/components/daw/TakeBrowserModal.tsx:127:3` — unused arg `scaleKey`.
37. `apps/web/src/components/daw/TemplatePicker.tsx:41:16` — setState in effect (`setBusyId`).
38. `apps/web/src/components/daw/TikTokSyncPanel.tsx:8:32` — explicit `any` type.
39. `apps/web/src/components/daw/TikTokSyncPanel.tsx:40:69` — explicit `any` type.
40. `apps/web/src/components/daw/TikTokSyncPanel.tsx:46:57` — explicit `any` type.
41. `apps/web/src/components/daw/TikTokSyncPanel.tsx:52:67` — explicit `any` type.
42. `apps/web/src/components/daw/TikTokSyncPanel.tsx:64:58` — explicit `any` type.
43. `apps/web/src/components/daw/UndoTimelinePanel.tsx:48:7` — setState in effect (`setSnapshots`).
44. `apps/web/src/components/daw/VersionHistoryModal.tsx:71:5` — setState in effect (`setLoading`).
45. `apps/web/src/components/daw/VibeMatchBrowser.tsx:42:62` — explicit `any` type.
46. `apps/web/src/components/daw/VocalHarmonyStacker.tsx:45:62` — explicit `any` type.
47. `apps/web/src/components/daw/VocalKeyDetection.tsx:47:62` — explicit `any` type.
48. `apps/web/src/components/daw/VocalKeyDetection.tsx:83:62` — explicit `any` type.
49. `apps/web/src/components/daw/VocalWarmupModal.tsx:95:21` — setState in effect (`setKey`).
50. `apps/web/src/components/daw/VocalWarmupModal.tsx:102:7` — setState in effect (`setDrone`).
