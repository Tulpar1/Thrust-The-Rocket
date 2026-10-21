"""
Thrust The Rocket - Flask Backend
=================================
Serves the game frontend and provides REST API endpoints backed by Supabase.
"""

import hmac
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, jsonify, render_template, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'templates'),
    static_folder=os.path.join(BASE_DIR, 'static'),
)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['TEMPLATES_AUTO_RELOAD'] = True

SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', '')
SUPABASE_TABLE = 'scores'

BLOCKED_NAME_TERMS = {
    'amk', 'aq', 'orospu', 'sikik', 'siktir', 'yarrak', 'pic', 'piç',
    'fuck', 'shit', 'bitch', 'cunt', 'nigger',
}


@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


def _supabase_request(method, path='', payload=None, query=None, prefer=None):
    """Call Supabase REST with the server-only service-role key."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError('Supabase environment variables are not configured')

    url = f'{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}{path}'
    if query:
        url = f'{url}?{urlencode(query)}'
    headers = {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
        'Content-Type': 'application/json',
    }
    if prefer:
        headers['Prefer'] = prefer
    body = json.dumps(payload).encode('utf-8') if payload is not None else None

    try:
        with urlopen(
            Request(url, data=body, headers=headers, method=method),
            timeout=10,
        ) as response:
            raw = response.read()
            return (json.loads(raw) if raw else []), response.headers
    except HTTPError as error:
        detail = error.read().decode('utf-8', errors='replace')
        app.logger.error('Supabase request failed (%s): %s', error.code, detail)
        raise RuntimeError('Supabase request failed') from error
    except URLError as error:
        app.logger.error('Supabase connection failed: %s', error.reason)
        raise RuntimeError('Supabase connection failed') from error


def _database_error_response(error):
    app.logger.error('%s', error)
    return jsonify({
        'status': 'error',
        'message': 'Database temporarily unavailable',
    }), 503


def _is_admin_request():
    """Check the admin bearer token without exposing it in a URL."""
    if not ADMIN_TOKEN:
        return False
    authorization = request.headers.get('Authorization', '')
    supplied_token = authorization.removeprefix('Bearer ').strip()
    return hmac.compare_digest(supplied_token, ADMIN_TOKEN)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/favicon.ico')
def favicon():
    return send_from_directory(
        os.path.join(app.root_path, 'static'),
        'favicon.ico',
        mimetype='image/vnd.microsoft.icon',
    )


@app.route('/api/score', methods=['POST'])
def submit_score():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'status': 'error', 'message': 'No JSON payload'}), 400

    required_fields = [
        'player_name', 'score', 'apogee',
        'altitude_accuracy', 'touchdown_speed', 'damage_amount',
        'failure_type', 'status',
    ]
    for field in required_fields:
        if field not in data:
            return jsonify({'status': 'error', 'message': f'Missing: {field}'}), 400

    player_name = str(data['player_name']).strip()
    normalized_name = ''.join(
        character for character in player_name.casefold()
        if character.isalnum()
    )
    if not player_name or len(player_name) > 20:
        return jsonify({'status': 'error', 'message': 'Invalid player name'}), 400
    if any(term in normalized_name for term in BLOCKED_NAME_TERMS):
        return jsonify({
            'status': 'error',
            'message': 'This player name is not allowed',
        }), 400

    try:
        score = int(data['score'])
        apogee = float(data['apogee'])
        altitude_accuracy = float(data['altitude_accuracy'])
        touchdown_speed = float(data['touchdown_speed'])
        damage_amount = float(data['damage_amount'])
        failure_type = str(data.get('failure_type', 'NONE'))[:40]
        status = str(data['status'])
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'Invalid score data'}), 400

    if status not in {'LANDED', 'DAMAGED', 'CRASHED'}:
        return jsonify({'status': 'error', 'message': 'Invalid status'}), 400

    payload = {
        'player_name': player_name,
        'score': score,
        'apogee': apogee,
        'altitude_accuracy': altitude_accuracy,
        'touchdown_speed': touchdown_speed,
        'damage_amount': damage_amount,
        'failure_type': failure_type,
        'status': status,
    }
    try:
        inserted, _ = _supabase_request(
            'POST',
            payload=payload,
            prefer='return=representation',
        )
        higher_scores, headers = _supabase_request(
            'GET',
            query={
                'select': 'id',
                'score': f'gt.{score}',
                'limit': '1',
            },
            prefer='count=exact',
        )
        content_range = headers.get('Content-Range', '')
        total_higher = int(content_range.rsplit('/', 1)[1]) if '/' in content_range else len(higher_scores)
    except (RuntimeError, ValueError) as error:
        return _database_error_response(error)

    score_id = inserted[0].get('id') if inserted else None
    return jsonify({
        'status': 'success',
        'score_id': score_id,
        'rank': total_higher + 1,
    })


@app.route('/api/admin/scores', methods=['GET'])
def admin_scores():
    if not _is_admin_request():
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
    try:
        rows, _ = _supabase_request(
            'GET',
            query={
                'select': 'id,player_name,score,created_at',
                'order': 'created_at.desc',
                'limit': '100',
            },
        )
    except RuntimeError as error:
        return _database_error_response(error)
    return jsonify({'status': 'success', 'scores': rows})


@app.route('/api/admin/scores/<int:score_id>', methods=['DELETE'])
def delete_score(score_id):
    if not _is_admin_request():
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
    try:
        deleted, _ = _supabase_request(
            'DELETE',
            path=f'?id=eq.{score_id}',
            prefer='return=representation',
        )
    except RuntimeError as error:
        return _database_error_response(error)
    if not deleted:
        return jsonify({'status': 'error', 'message': 'Score not found'}), 404
    return jsonify({'status': 'success', 'deleted_id': score_id})


@app.route('/api/leaderboard')
def leaderboard():
    try:
        rows, _ = _supabase_request(
            'GET',
            query={
                'select': (
                    'id,player_name,score,apogee,altitude_accuracy,'
                    'touchdown_speed,damage_amount,failure_type,status,created_at'
                ),
                'order': 'score.desc',
                'limit': '10',
            },
        )
    except RuntimeError as error:
        return _database_error_response(error)

    entries = []
    for rank, row in enumerate(rows, 1):
        entries.append({'rank': rank, **row})
    return jsonify({'status': 'success', 'leaderboard': entries})


@app.route('/api/health')
def health():
    return jsonify({'status': 'healthy', 'game': 'Thrust The Rocket v1.0'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
