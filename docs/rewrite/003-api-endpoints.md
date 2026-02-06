# API Endpoints

## Dictate
`POST /v1/dictate` (multipart)
- audio
- session_id, chunk_index, is_final, language, prompt

## Live
`POST /v1/live/chunk` (multipart)
- audio
- session_id, chunk_index, translate_to

## Transcribe
- `POST /v1/transcribe/jobs`
- `POST /v1/transcribe/jobs/{id}/chunks`
- `POST /v1/transcribe/jobs/{id}/run`
- `GET /v1/transcribe/jobs/{id}`
- `GET /v1/transcribe/jobs/{id}/result`

## TTS
`POST /v1/tts`

## Translate
`POST /v1/translate`

## AI Edit
`POST /v1/ai-edit`
