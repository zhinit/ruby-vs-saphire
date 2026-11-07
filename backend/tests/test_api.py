from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from backend import main

GAME = str(uuid4())
TASK = str(uuid4())
USER = str(uuid4())
AUTH = {'Authorization': 'Bearer player-jwt'}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('SUPABASE_URL', 'https://example.supabase.co')
    monkeypatch.setenv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    return TestClient(main.app)


@pytest.fixture
def upstream(monkeypatch):
    calls = []
    state = {'started': True, 'winner': None, 'tasks': [{'id': TASK}], 'completions': []}

    async def fake(method, path, token=None, payload=None):
        calls.append((method, path, token, payload))
        if path == '/auth/v1/user':
            return {'id': USER, 'user_metadata': {'name': 'Sam'}}
        if path.endswith('game_state'):
            return state
        if path.endswith('list_games'):
            return []
        return {'ok': True}
    monkeypatch.setattr(main, 'supabase', fake)
    return calls, state


def test_missing_configuration(client, monkeypatch):
    monkeypatch.delenv('SUPABASE_URL')
    assert client.get('/api/config').status_code == 503


def test_public_discovery_and_no_cache(client, upstream):
    response = client.get('/api/games')
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    assert upstream[0][-1][2] is None


def test_join_requires_authentication(client, upstream):
    assert client.post(f'/api/games/{GAME}/join').status_code == 401
    assert upstream[0] == []


def test_join_uses_verified_player_and_does_not_accept_chosen_team(client, upstream):
    response = client.post(f'/api/games/{GAME}/join', headers=AUTH, json={'team': 'Sapphire', 'user_id': 'attacker'})
    assert response.status_code == 200
    assert upstream[0][0][1] == '/auth/v1/user'
    assert upstream[0][-1] == ('POST', '/rest/v1/rpc/join_game', 'player-jwt', {'p_game': GAME})


@pytest.mark.parametrize('change', [{'started': False}, {'winner': 'Ruby'}, {'tasks': []}, {'completions': [{'task_id': TASK}]}])
def test_upload_rejects_invalid_game_state(client, upstream, change):
    upstream[1].update(change)
    response = client.post(f'/api/games/{GAME}/tasks/{TASK}/upload', headers=AUTH, json={'content_type': 'image/jpeg', 'size': 1000})
    assert response.status_code in (404, 409)


def test_upload_path_bound_to_identity_and_task(client, upstream):
    response = client.post(f'/api/games/{GAME}/tasks/{TASK}/upload', headers=AUTH, json={'content_type': 'image/jpeg', 'size': 1000})
    assert response.status_code == 200
    assert response.json()['path'].startswith(f'{USER}/{GAME}/{TASK}/')
    assert response.json()['url'].startswith('https://example.supabase.co/storage/v1/object/evidence/')


@pytest.mark.parametrize('body', [{'content_type':'image/svg+xml','size':10}, {'content_type':'image/jpeg','size':2097153}])
def test_upload_type_and_size_validation(client, upstream, body):
    assert client.post(f'/api/games/{GAME}/tasks/{TASK}/upload', headers=AUTH,json=body).status_code in (400,422)


def test_blank_chat_is_rejected(client, upstream):
    assert client.post(f'/api/games/{GAME}/messages',headers=AUTH,json={'body':'  '}).status_code == 400


def test_completion_delegates_atomic_operation(client, upstream):
    path=f'{USER}/{GAME}/{TASK}/{uuid4()}.jpg'
    response=client.post(f'/api/games/{GAME}/tasks/{TASK}/complete',headers=AUTH,json={'photo_path':path})
    assert response.status_code == 200
    assert upstream[0][-1][1:] == ('/rest/v1/rpc/complete_task','player-jwt',{'p_game':GAME,'p_task':TASK,'p_photo':path})


def test_unknown_api_does_not_return_spa(client):
    assert client.get('/api/not-found').status_code == 404


def test_invalid_token_rejected_by_supabase(client, monkeypatch):
    original=httpx.AsyncClient
    seen=[]
    def handler(request):
        seen.append(request)
        return httpx.Response(401,json={'message':'Invalid JWT'})
    monkeypatch.setattr(main.httpx,'AsyncClient',lambda **kwargs:original(transport=httpx.MockTransport(handler)))
    response=client.post(f'/api/games/{GAME}/join',headers=AUTH)
    assert response.status_code == 401
    assert len(seen)==1
    assert seen[0].url.path=='/auth/v1/user'
    assert seen[0].headers['authorization']=='Bearer player-jwt'


def test_internal_errors_are_not_exposed(client, monkeypatch):
    original=httpx.AsyncClient
    monkeypatch.setattr(main.httpx,'AsyncClient',lambda **kwargs:original(transport=httpx.MockTransport(lambda request:httpx.Response(500,json={'message':'secret SQL details'}))))
    response=client.get('/api/games')
    assert response.status_code == 502
    assert 'secret SQL' not in response.text


def test_secret_key_is_never_published(client, monkeypatch):
    monkeypatch.setenv('SUPABASE_PUBLISHABLE_KEY','sb_secret_do_not_expose')
    response=client.get('/api/config')
    assert response.status_code == 503
    assert 'sb_secret_do_not_expose' not in response.text
