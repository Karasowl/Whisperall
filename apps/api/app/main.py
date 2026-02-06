from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import health, dictate, live, transcribe, tts, translate, ai_edit

app = FastAPI(title='Whisperall API', version='2.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(health.router)
app.include_router(dictate.router)
app.include_router(live.router)
app.include_router(transcribe.router)
app.include_router(tts.router)
app.include_router(translate.router)
app.include_router(ai_edit.router)
