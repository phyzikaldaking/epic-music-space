-- Only expose the reviewed CC0 808 and choir files from the legacy sound bucket.
-- Unlicensed drum-kit files and non-audio archives/documents remain unlisted.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read reviewed CC0 Studio sounds'
  ) then
    create policy "Public read reviewed CC0 Studio sounds"
      on storage.objects
      for select
      to anon, authenticated
      using (
        bucket_id = 'SOUND KITS,LOOPS,SAMPLES'
        and (
          name ~ '^808_[0-9]+\.wav$'
          or name ~ '^CHOIR_SerbianOrthodox_Ambience_.*\.wav$'
        )
      );
  end if;
end
$$;
