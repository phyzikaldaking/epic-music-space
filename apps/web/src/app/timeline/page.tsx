import { redirect } from "next/navigation";

type TimelinePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  const params = (await searchParams) ?? {};
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        if (typeof v === "string") query.append(key, v);
      }
    } else if (typeof value === "string") {
      query.set(key, value);
    }
  }

  const suffix = query.toString();
  redirect(suffix ? `/forum?${suffix}` : "/forum");
}
