# Chunking Strategy

## Dictado
- Grabacion continua.
- Transcripcion en bloques 60-180s con overlap.
- Prompt con texto previo.
- Limpieza final de muletillas.

## Live
- Chunks de 1-2s.
- Deepgram por HTTP.
- Resultados por Realtime.

## Archivos largos
- 5 min por chunk.
- Procesamiento async con Groq.
