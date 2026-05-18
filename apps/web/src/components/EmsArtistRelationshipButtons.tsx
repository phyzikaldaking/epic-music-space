import Link from "next/link";
import { EMS_RELATIONSHIP_LABELS } from "@/lib/emsRelationships";

type EmsArtistRelationshipButtonsProps = {
  handle: string;
  isOwnProfile?: boolean;
};

export default function EmsArtistRelationshipButtons({
  handle,
  isOwnProfile = false,
}: EmsArtistRelationshipButtonsProps) {
  if (isOwnProfile) {
    return (
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/profile/edit" className="rounded-full bg-white px-5 py-3 text-sm font-black text-black">
          Edit Profile
        </Link>
        <Link href="/dashboard/payouts" className="rounded-full border border-gold-300/40 bg-gold-300/10 px-5 py-3 text-sm font-bold text-gold-100">
          Payouts
        </Link>
        <Link href="/studio/new" className="rounded-full border border-white/15 px-5 py-3 text-sm font-bold text-white">
          Upload Song
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link href={`/artist/${handle}?action=invest`} className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-black text-black">
        {EMS_RELATIONSHIP_LABELS.investor.action}
      </Link>
      <Link href={`/artist/${handle}?action=ally`} className="rounded-full border border-white/15 px-5 py-3 text-sm font-bold text-white">
        {EMS_RELATIONSHIP_LABELS.ally.action}
      </Link>
      <Link href={`/artist/${handle}?action=stakeholder`} className="rounded-full border border-fuchsia-300/35 bg-fuchsia-300/10 px-5 py-3 text-sm font-bold text-fuchsia-100">
        {EMS_RELATIONSHIP_LABELS.stakeholder.action}
      </Link>
      <Link href={`/artist/${handle}?action=client`} className="rounded-full border border-gold-300/35 bg-gold-300/10 px-5 py-3 text-sm font-bold text-gold-100">
        {EMS_RELATIONSHIP_LABELS.client.action}
      </Link>
      <Link href={`/studio?collaborate=${handle}`} className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-5 py-3 text-sm font-bold text-emerald-100">
        {EMS_RELATIONSHIP_LABELS.collaborator.action}
      </Link>
    </div>
  );
}
