se queda trabado aqui es como si no identificara que ya barrio y ya transcribuoi todo el video ehecho comprobe qe los tranwcribio coketo pero se queda colgado en el 90% aprox y aun dice Transcribing...
Loading audio into memory (torchcodec missing)...v y otra coisa speed to teext solo muestra faster whisper  y si quiero usar Real-time Reader me da error ackend] INFO:     127.0.0.1:4764 - "GET /api/transcribe/diarization-status HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:4764 - "GET /api/history?limit=50&offset=0 HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:4764 - "GET /api/transcribe/history HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:4764 - "GET /dictate/index.txt?_rsc=1t4w8 HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:4764 - "GET /api/providers/stt HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:3931 - "GET /api/settings/providers/stt HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:3931 - "PUT /api/settings/providers/stt HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:11866 - "GET /models/index.txt?_rsc=1elm3 HTTP/1.1" 200 OK y al intentar ai text editing con illama local me da este error Backend Error] ERROR:    Exception in ASGI application
Traceback (most recent call last):
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connection.py", line 204, in _new_conn
    sock = connection.create_connection(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\util\connection.py", line 85, in create_connection
    raise err
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\util\connection.py", line 73, in create_connection
    sock.connect(sa)
ConnectionRefusedError: [WinError 10061] No se puede establecer una conexi�n ya que el equipo de destino deneg� expresamente dicha conexi�n

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connectionpool.py", line 787, in urlopen
    response = self._make_request(
               ^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connectionpool.py", line 493, in _make_request
    conn.request(
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connection.py", line 500, in request
    self.endheaders()
  File "C:\Users\adven\AppData\Local\Programs\Python\Python311\Lib\http\client.py", line 1298, in endheaders
    self._send_output(message_body, encode_chunked=encode_chunked)
  File "C:\Users\adven\AppData\Local\Programs\Python\Python311\Lib\http\client.py", line 1058, in _send_output
    self.send(msg)
  File "C:\Users\adven\AppData\Local\Programs\Python\Python311\Lib\http\client.py", line 996, in send
    self.connect()
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connection.py", line 331, in connect
    self.sock = self._new_conn()
                ^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connection.py", line 219, in _new_conn
    raise NewConnectionError(
urllib3.exceptions.NewConnectionError: HTTPConnection(host='localhost', port=11434): Failed to establish a new connection: [WinError 10061] No se puede establecer una conexi�n ya que el equipo de destino deneg� expresamente dicha conexi�n

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\requests\adapters.py", line 644, in send
    resp = conn.urlopen(
           ^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connectionpool.py", line 841, in urlopen
    retries = retries.increment(
              ^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\util\retry.py", line 519, in increment
    raise MaxRetryError(_pool, url, reason) from reason  # type: ignore[arg-type]
    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
urllib3.exceptions.MaxRetryError: HTTPConnectionPool(host='localhost', port=11434): Max retries exceeded with url: /api/generate (Caused by NewConnectionError("HTTPConnection(host='localhost', port=11434): Failed to establish a new connection: [WinError 10061] No se puede establecer una conexi�n ya que el equipo de destino deneg� expresamente dicha conexi�n"))

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\uvicorn\protocols\http\h11_impl.py", line 410, in run_asgi
    result = await app(  # type: ignore[func-returns-value]
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\uvicorn\middleware\proxy_headers.py", line 60, in __call__
    return await self.app(scope, receive, send)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\applications.py", line 1135, in __call__
    await super().__call__(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\applications.py", line 107, in __call__
    await self.middleware_stack(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\errors.py", line 186, in __call__
    raise exc
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\errors.py", line 164, in __call__
    await self.app(scope, receive, _send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\cors.py", line 93, in __call__
    await self.simple_response(scope, receive, send, request_headers=headers)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\cors.py", line 144, in simple_response
    await self.app(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\exceptions.py", line 63, in __call__
    await wrap_app_handling_exceptions(self.app, conn)(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\middleware\asyncexitstack.py", line 18, in __call__
    await self.app(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\routing.py", line 716, in __call__
    await self.middleware_stack(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\routing.py", line 736, in app
    await route.handle(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\routing.py", line 290, in handle
    await self.app(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\routing.py", line 115, in app
    await wrap_app_handling_exceptions(app, request)(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\routing.py", line 101, in app
    response = await f(request)
               ^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\routing.py", line 355, in app
    raw_response = await run_endpoint_function(
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\routing.py", line 243, in run_endpoint_function
    return await dependant.call(**values)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\ui\backend\main.py", line 2031, in ai_edit
    edited_text, meta = service.edit(request.text, request.command, provider=request.provider)
                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\ui\backend\ai_editor.py", line 181, in edit
    return self._edit_ollama(text, command)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\ui\backend\ai_editor.py", line 80, in _edit_ollama
    resp = requests.post(f"{base_url}/api/generate", json=payload, timeout=120)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\requests\api.py", line 115, in post
    return request("post", url, data=data, json=json, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\requests\api.py", line 59, in request
    return session.request(method=method, url=url, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\requests\sessions.py", line 589, in request
    resp = self.send(prep, **send_kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\requests\sessions.py", line 703, in send
    r = adapter.send(request, **kwargs)
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\requests\adapters.py", line 677, in send
    raise ConnectionError(e, request=request)
requests.exceptions.ConnectionError: HTTPConnectionPool(host='localhost', port=11434): Max retries exceeded with url: /api/generate (Caused by NewConnectionError("HTTPConnection(host='localhost', port=11434): Failed to establish a new connection: [WinError 10061] No se puede establecer una conexi�n ya que el equipo de destino deneg� expresamente dicha conexi�n"))
 

[Backend] INFO:     127.0.0.1:11866 - "GET /api/models/status HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:11868 - "GET /transcribe/index.txt?_rsc=xta5k HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:11868 - "GET /api/providers/stt HTTP/1.1" 200 OK

[IPC net-fetch] Request: GET http://localhost:8000/api/settings/diarization.safety
[IPC net-fetch] Request: GET http://localhost:8000/api/cache/audio/status
[Backend] [Diarization Status] installed=True, token_configured=True, available=True, cached=True, model_errors=[]
[Backend] 

[Backend] INFO:     127.0.0.1:11868 - "GET /api/transcribe/diarization-status HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:3636 - "GET /api/settings/diarization.safety HTTP/1.1" 200 OK

[IPC net-fetch] Status: 200
[IPC net-fetch] Body: {"path":"diarization.safety","value":{"mode":"safe","device":"cpu","test_hotspot_c":null}}
[Backend] INFO:     127.0.0.1:3639 - "GET /api/cache/audio/status HTTP/1.1" 200 OK

[IPC net-fetch] Status: 200
[IPC net-fetch] Body: {"count":3,"total_bytes":61788318,"total_gb":0.06,"max_age_days":30,"max_size_gb":10.0,"path":"C:\\Users\\adven\\AppData\\Local\\ChatterboxUI\\cache\\audio"}
[Backend] INFO:     127.0.0.1:3641 - "GET /api/transcribe/engine-status HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:3642 - "GET /api/settings/providers/stt HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:3643 - "GET /reader/index.txt?_rsc=1cgmv HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:3643 - "GET /_next/static/chunks/a7e467279ad1e7df.js HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:3643 - "GET /api/system/capabilities HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:3642 - "GET /api/providers/tts HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:3641 - "GET /api/settings/providers/tts HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:12884 - "PUT /api/settings/providers/tts HTTP/1.1" 200 OK

[Backend] INFO:     127.0.0.1:12885 - "POST /api/reader/speak HTTP/1.1" 500 Internal Server Error

[Backend Error] ERROR:    Exception in ASGI application
Traceback (most recent call last):
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\uvicorn\protocols\http\h11_impl.py", line 410, in run_asgi
    result = await app(  # type: ignore[func-returns-value]
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\uvicorn\middleware\proxy_headers.py", line 60, in __call__
    return await self.app(scope, receive, send)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\applications.py", line 1135, in __call__
    await super().__call__(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\applications.py", line 107, in __call__
    await self.middleware_stack(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\errors.py", line 186, in __call__
    raise exc
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\errors.py", line 164, in __call__
    await self.app(scope, receive, _send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\cors.py", line 93, in __call__
    await self.simple_response(scope, receive, send, request_headers=headers)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\cors.py", line 144, in simple_response
    await self.app(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\exceptions.py", line 63, in __call__
    await wrap_app_handling_exceptions(self.app, conn)(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\middleware\asyncexitstack.py", line 18, in __call__
    await self.app(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\routing.py", line 716, in __call__
    await self.middleware_stack(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\routing.py", line 736, in app
    await route.handle(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\routing.py", line 290, in handle
    await self.app(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\routing.py", line 115, in app
    await wrap_app_handling_exceptions(app, request)(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\routing.py", line 101, in app
    response = await f(request)
               ^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\routing.py", line 355, in app
    raw_response = await run_endpoint_function(
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\routing.py", line 243, in run_endpoint_function
    return await dependant.call(**values)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\ui\backend\main.py", line 1997, in reader_speak
    reader.synthesize_to_file(
  File "e:\dev-projects\chatterbox\ui\backend\reader_service.py", line 72, in synthesize_to_file
    audio, sample_rate = self.synthesize(
                         ^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\ui\backend\reader_service.py", line 43, in synthesize
    return self._synthesize_kokoro(text, voice or "af_sky", speed)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\ui\backend\reader_service.py", line 31, in _synthesize_kokoro
    raise RuntimeError("Kokoro integration not available")
RuntimeError: Kokoro integration not available en Speecht to text me dio este error STT partial failed: Invalid model size 'faster-whisper-medium', expected one of: tiny.en, tiny, base.en, base, small.en, small, medium.en, medium, large-v1, large-v2, large-v3, large, distil-large-v2, distil-medium.en, distil-small.en, distil-large-v3, distil-large-v3.5, large-v3-turbo, turbo  
[Backend] INFO:     127.0.0.1:8626 - "POST /api/stt/stop HTTP/1.1" 500 Internal Server Error    Backend Error] ERROR:    Exception in ASGI application
Traceback (most recent call last):
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connection.py", line 204, in _new_conn
    sock = connection.create_connection(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\util\connection.py", line 85, in create_connection
    raise err
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\util\connection.py", line 73, in create_connection
    sock.connect(sa)
ConnectionRefusedError: [WinError 10061] No se puede establecer una conexi�n ya que el equipo de destino deneg� expresamente dicha conexi�n

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connectionpool.py", line 787, in urlopen
    response = self._make_request(
               ^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connectionpool.py", line 493, in _make_request
    conn.request(
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connection.py", line 500, in request
    self.endheaders()
  File "C:\Users\adven\AppData\Local\Programs\Python\Python311\Lib\http\client.py", line 1298, in endheaders
    self._send_output(message_body, encode_chunked=encode_chunked)
  File "C:\Users\adven\AppData\Local\Programs\Python\Python311\Lib\http\client.py", line 1058, in _send_output
    self.send(msg)
  File "C:\Users\adven\AppData\Local\Programs\Python\Python311\Lib\http\client.py", line 996, in send
    self.connect()
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connection.py", line 331, in connect
    self.sock = self._new_conn()
                ^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connection.py", line 219, in _new_conn
    raise NewConnectionError(
urllib3.exceptions.NewConnectionError: HTTPConnection(host='localhost', port=11434): Failed to establish a new connection: [WinError 10061] No se puede establecer una conexi�n ya que el equipo de destino deneg� expresamente dicha conexi�n

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\requests\adapters.py", line 644, in send
    resp = conn.urlopen(
           ^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\connectionpool.py", line 841, in urlopen
    retries = retries.increment(
              ^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\urllib3\util\retry.py", line 519, in increment
    raise MaxRetryError(_pool, url, reason) from reason  # type: ignore[arg-type]
    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
urllib3.exceptions.MaxRetryError: HTTPConnectionPool(host='localhost', port=11434): Max retries exceeded with url: /api/generate (Caused by NewConnectionError("HTTPConnection(host='localhost', port=11434): Failed to establish a new connection: [WinError 10061] No se puede establecer una conexi�n ya que el equipo de destino deneg� expresamente dicha conexi�n"))

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\uvicorn\protocols\http\h11_impl.py", line 410, in run_asgi
    result = await app(  # type: ignore[func-returns-value]
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\uvicorn\middleware\proxy_headers.py", line 60, in __call__
    return await self.app(scope, receive, send)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\applications.py", line 1135, in __call__
    await super().__call__(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\applications.py", line 107, in __call__
    await self.middleware_stack(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\errors.py", line 186, in __call__
    raise exc
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\errors.py", line 164, in __call__
    await self.app(scope, receive, _send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\cors.py", line 93, in __call__
    await self.simple_response(scope, receive, send, request_headers=headers)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\cors.py", line 144, in simple_response
    await self.app(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\middleware\exceptions.py", line 63, in __call__
    await wrap_app_handling_exceptions(self.app, conn)(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\middleware\asyncexitstack.py", line 18, in __call__
    await self.app(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\routing.py", line 716, in __call__
    await self.middleware_stack(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\routing.py", line 736, in app
    await route.handle(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\routing.py", line 290, in handle
    await self.app(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\routing.py", line 115, in app
    await wrap_app_handling_exceptions(app, request)(scope, receive, send)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\routing.py", line 101, in app
    response = await f(request)
               ^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\routing.py", line 355, in app
    raw_response = await run_endpoint_function(
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\fastapi\routing.py", line 243, in run_endpoint_function
    return await dependant.call(**values)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\ui\backend\main.py", line 2031, in ai_edit
    edited_text, meta = service.edit(request.text, request.command, provider=request.provider)
                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\ui\backend\ai_editor.py", line 181, in edit
    return self._edit_ollama(text, command)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\ui\backend\ai_editor.py", line 80, in _edit_ollama
    resp = requests.post(f"{base_url}/api/generate", json=payload, timeout=120)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\requests\api.py", line 115, in post
    return request("post", url, data=data, json=json, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\requests\api.py", line 59, in request
    return session.request(method=method, url=url, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\requests\sessions.py", line 589, in request
    resp = self.send(prep, **send_kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\requests\sessions.py", line 703, in send
    r = adapter.send(request, **kwargs)
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "e:\dev-projects\chatterbox\venv\Lib\site-packages\requests\adapters.py", line 677, in send
    raise ConnectionError(e, request=request)
requests.exceptions.ConnectionError: HTTPConnectionPool(host='localhost', port=11434): Max retries exceeded with url: /api/generate (Caused by NewConnectionError("HTTPConnection(host='localhost', port=11434): Failed to establish a new connection: [WinError 10061] No se puede establecer una conexi�n ya que el equipo de destino deneg� expresamente dicha conexi�n"))
 Lo peor es que Oyama local no sale entre los modelos para instalar o desinstalar los modelos locales. Es como que no está. Pero aparte de que no está, sí se identifica como algo para utilizar ahí en ese módulo. Cosa que es una contradicción. Entonces no sé si es que está en mi computadora, pero no se maneja desde acá con todo el sistema de reconocimiento de modelos instalados y de instalación y desinstalación de modelos. O si es que no está en mi computadora, pero aparece por defecto hardcodeado ahí en ese módulo. Lo smimo sucede con argos y el modulo Traslate y se supone que tenemso mucho s modelos que peuden traducor no y no se bven para elgir en ese modulo Y en "Audiobook Creator" elijo cualquier modelo y, sin embargo, las opciones aparecen las mismas. Sin embargo, hay modelos como "Cocoro" que tienen sus propias voces y no me deja elegirlos. Es decir, cada modelo debería venir con sus propias opciones distintas y, sin embargo, eso no lo hace la aplicación. No tomes a "Cocoro" como algo arreglado. Toma el principio que está detrás de ese problema que te estoy diciendo como algo a arreglar Y en muchos de esos módulos simplemente sale generando. No hay barra de progreso como lo hay en transcribir, por ejemplo. Ni hay forma de detener el proceso, tampoco ni de pausarlo, ni nada. 