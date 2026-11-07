"""Stateless FastAPI API. Supabase verifies identity and enforces database rules.

All database requests carry the player's JWT, never a service-role credential.
Transactions live in SQL so direct PostgREST calls enforce identical rules.
"""
import os
import base64
import json
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env')
app = FastAPI(title='Ruby vs Sapphire API', version='0.1.0')


def settings():
    url = os.getenv('SUPABASE_URL', '').rstrip('/')
    key = os.getenv('SUPABASE_PUBLISHABLE_KEY', '')
    if not url or not key or 'YOUR_' in url or 'YOUR_' in key:
        raise HTTPException(503, 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env.')
    privileged = key.startswith('sb_secret_')
    if key.startswith('eyJ'):
        try:
            payload = key.split('.')[1]
            privileged = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4))).get('role') == 'service_role'
        except (ValueError, IndexError):
            raise HTTPException(503, 'Invalid Supabase key configuration.') from None
    if privileged:
        raise HTTPException(503, 'Use a publishable or anon key, never a secret or service-role key.')
    return url, key


async def supabase(method, path, token=None, payload=None):
    url, key = settings()
    headers = {'apikey': key}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    try:
        async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
            response = await client.request(method, f'{url}{path}', headers=headers, json=payload)
    except httpx.RequestError:
        raise HTTPException(503, 'Cannot reach Supabase. Please try again.') from None
    if response.is_error:
        try:
            error = response.json()
        except ValueError:
            error = {}
        code = error.get('code')
        if response.status_code == 401:
            raise HTTPException(401, 'Your session has expired. Please sign in again.')
        if code in ('P0001', 'P0002', '22023', '42501'):
            status = {'P0001': 409, 'P0002': 404, '22023': 400, '42501': 403}[code]
            raise HTTPException(status, error.get('message', 'Request not allowed.'))
        if response.status_code == 429:
            raise HTTPException(429, 'Too many requests. Please try again shortly.')
        # Never leak SQL, internal errors, or credentials into the browser.
        raise HTTPException(502, 'Supabase could not complete this request. Check the database setup and try again.')
    return response.json() if response.content else None


async def identity(authorization: Annotated[str | None, Header()] = None):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Please sign in.')
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(401, 'Please sign in.')
    user = await supabase('GET', '/auth/v1/user', token)
    if not user or not user.get('id'):
        raise HTTPException(401, 'Please sign in again.')
    return {'token': token, 'user': user}


Identity = Annotated[dict, Depends(identity)]


async def rpc(name, token=None, **params):
    return await supabase('POST', f'/rest/v1/rpc/{name}', token, params)


@app.middleware('http')
async def headers(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response


@app.get('/api/health')
async def health():
    return {'ok': True, 'configured': bool(os.getenv('SUPABASE_URL') and os.getenv('SUPABASE_PUBLISHABLE_KEY'))}


@app.get('/api/config')
async def config():
    url, key = settings()
    return {'url': url, 'key': key}


@app.get('/api/me')
async def me(actor: Identity):
    u = actor['user']
    return {'id': u['id'], 'email': u.get('email'), 'name': u.get('user_metadata', {}).get('name') or 'Player'}


@app.get('/api/games')
async def games(authorization: Annotated[str | None, Header()] = None):
    # Public discovery; when signed in include the caller's saved memberships.
    actor = await identity(authorization) if authorization else None
    return await rpc('list_games', actor['token'] if actor else None)


@app.post('/api/games/{game_id}/join')
async def join(game_id: UUID, actor: Identity):
    return await rpc('join_game', actor['token'], p_game=str(game_id))


@app.get('/api/games/{game_id}')
async def game(game_id: UUID, actor: Identity):
    return await rpc('game_state', actor['token'], p_game=str(game_id))


class Message(BaseModel):
    body: str = Field(min_length=1, max_length=500)


@app.post('/api/games/{game_id}/messages', status_code=201)
async def message(game_id: UUID, data: Message, actor: Identity):
    if not data.body.strip():
        raise HTTPException(400, 'Write a message first.')
    await rpc('send_message', actor['token'], p_game=str(game_id), p_body=data.body.strip())
    return {'ok': True}


class Upload(BaseModel):
    content_type: str
    size: int = Field(gt=0, le=2 * 1024 * 1024)


@app.post('/api/games/{game_id}/tasks/{task_id}/upload')
async def upload(game_id: UUID, task_id: UUID, data: Upload, actor: Identity):
    extensions = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}
    if data.content_type not in extensions:
        raise HTTPException(400, 'Choose a JPEG, PNG, or WebP photo.')
    state = await rpc('game_state', actor['token'], p_game=str(game_id))
    if not state['started'] or state['winner']:
        raise HTTPException(409, 'Photos can only be submitted while the game is live.')
    if not any(t['id'] == str(task_id) for t in state['tasks']):
        raise HTTPException(404, 'Task not found.')
    if any(c['task_id'] == str(task_id) for c in state['completions']):
        raise HTTPException(409, 'Your team already completed this task.')
    path = f"{actor['user']['id']}/{game_id}/{task_id}/{uuid4()}.{extensions[data.content_type]}"
    url, _ = settings()
    # Browser uploads directly using its JWT; the storage policy repeats every check.
    return {'path': path, 'url': f'{url}/storage/v1/object/evidence/{path}'}


class Completion(BaseModel):
    photo_path: str = Field(min_length=1, max_length=300, pattern=r'^[a-zA-Z0-9/._-]+$')


@app.post('/api/games/{game_id}/tasks/{task_id}/complete')
async def complete(game_id: UUID, task_id: UUID, data: Completion, actor: Identity):
    return await rpc('complete_task', actor['token'], p_game=str(game_id), p_task=str(task_id), p_photo=data.photo_path)


# No SPA catch-all on /api: unknown API URLs stay 404.
assets = ROOT / 'ruby-sapphire-prototype' / 'dist' / 'assets'
app.mount('/assets', StaticFiles(directory=assets, check_dir=False), name='assets')


@app.get('/', include_in_schema=False)
async def frontend():
    path = ROOT / 'ruby-sapphire-prototype' / 'dist' / 'index.html'
    if not path.exists():
        return Response('Run npm run build, or use the Vite development server.', media_type='text/plain')
    return FileResponse(path)
