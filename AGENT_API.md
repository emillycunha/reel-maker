# Reel Maker agent API

Base URL: `http://127.0.0.1:4318`

Start with `GET /api/agent`. Responses are intentionally compact. Use names from the inventory directly; asset IDs are optional.

## Minimal workflow

```sh
# Find only relevant video metadata
curl 'http://127.0.0.1:4318/api/agent/assets?kind=video&q=soccer&limit=30'

# Create an editable reel project (each shot is capped at 3 seconds)
curl -X POST http://127.0.0.1:4318/api/agent/reels \
  -H 'content-type: application/json' \
  --data '{
    "name":"Training Reel 01",
    "voiceover":"voiceover-01.mp3",
    "music":"soft-background.mp3",
    "shots":[
      {"clip":"practice-wide.mp4","start":0.4,"duration":2.5,"caption":"Build confident players"},
      {"clip":"coach-closeup.mp4","start":1.0,"duration":2.5,"caption":"One session at a time"}
    ]
  }'
```

Caption punctuation is removed unless `"captions":{"punctuation":true}` is supplied. Caption slides default to four words. The response returns only the saved filename, shot count, and duration. Open the result from the Reel Maker project browser for visual review and export.

## Carousel

```sh
curl -X POST http://127.0.0.1:4318/api/agent/carousels \
  -H 'content-type: application/json' \
  --data '{
    "name":"Development Carousel",
    "format":"4:5",
    "slides":[
      {"eyebrow":"COACHING NOTES","title":"Development takes time","body":"Give players room to solve the game"},
      {"eyebrow":"01","title":"Reward the decision","body":"The outcome will follow"}
    ]
  }'
```

An optional slide `image` may be an exact asset filename or ID. Formats are `4:5` and `1:1`.

## Read and update

- `GET /api/agent/projects?q=text&limit=30` lists filtered compact project summaries.
- `GET /api/agent/projects/:filename` returns a compact content summary.
- Add `?view=full` only when the full editable JSON is needed.
- `PATCH /api/agent/projects/:filename` shallow-merges project fields and merges `style`, `meme`, and `carousel` settings.

Use URL encoding for project filenames. Save under a new `name` when creating a variation so the source project is not overwritten.
