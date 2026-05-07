# Sample Library

Drop CC0 / public-domain audio files here. The DAW's Sample Library
panel (`apps/web/src/components/daw/SampleLibraryPanel.tsx`) references
specific paths under this directory:

```
/samples/drums/808-kick-c1.wav
/samples/drums/trap-snare.wav
... etc
```

If a file is missing the load fails silently — the panel doesn't crash,
the user just sees a "Couldn't load sample" notice. So you can ship
the panel before the audio is sourced, and back-fill packs over time.

## Where to source CC0 audio

- https://freesound.org (filter by CC0)
- https://samples.freedrumkits.net (most are royalty-free, check each)
- https://splice.com/sounds/free (the free tier; verify license)
- https://looperman.com (mix of CC0 and BY, check each)

## License hygiene

If you add a non-CC0 sample (e.g. CC-BY), update the manifest in
SampleLibraryPanel.tsx with attribution and update the panel UI to
display it. Default assumption: CC0, no attribution required.
