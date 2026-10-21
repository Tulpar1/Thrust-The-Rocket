"""
Thrust The Rocket — Flask Backend
=================================
Serves the game frontend and provides REST API endpoints for
score submission and leaderboard retrieval using SQLite.
"""

import os
import sqlite3
import tempfile
import hmac
from flask import Flask, render_template, request, jsonify, g, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'templates'),
    static_folder=os.path.join(BASE_DIR, 'static')
)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['TEMPLATES_AUTO_RELOAD'] = True

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
# Vercel sunucusuz (serverless) ortamında sadece geçici klasör yazılabilir (read-write) durumdadır.
IS_VERCEL = bool(os.environ.get('VERCEL'))
if IS_VERCEL:
    DATABASE = os.path.join(tempfile.gettempdir(), 'scores.db')
else:
    DATABASE = os.path.join(BASE_DIR, 'scores.db')

ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', '')

# This is intentionally conservative. It is a short-term moderation guard, not
# a replacement for reviewing the leaderboard.
BLOCKED_NAME_TERMS = {
    'amk', 'aq', 'orospu', 'sikik', 'siktir', 'yarrak', 'pic', 'piç',
    'fuck', 'shit', 'bitch', 'cunt', 'nigger',
}


def get_db():
    """Return a per-request database connection."""
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE, timeout=10)
        g.db.execute('PRAGMA busy_timeout = 10000')
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception):
    """Close the database connection at the end of each request."""
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    """Create tables and indices without modifying player records."""
    os.makedirs(os.path.dirname(os.path.abspath(DATABASE)), exist_ok=True)
    with sqlite3.connect(DATABASE, timeout=10) as db:
        db.execute('PRAGMA busy_timeout = 10000')
        db.execute('PRAGMA journal_mode = WAL')
        db.execute('''
            CREATE TABLE IF NOT EXISTS scores (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                player_name       TEXT    NOT NULL DEFAULT 'Anonymous',
                score             INTEGER NOT NULL,
                apogee            REAL    NOT NULL,
                altitude_accuracy REAL    NOT NULL,
                touchdown_speed   REAL    NOT NULL,
                damage_amount     REAL    NOT NULL DEFAULT 0,
                failure_type      TEXT    NOT NULL DEFAULT 'NONE',
                status            TEXT    NOT NULL CHECK(status IN ('LANDED','DAMAGED','CRASHED')),
                created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        columns = {row[1] for row in db.execute('PRAGMA table_info(scores)').fetchall()}
        if 'damage_amount' not in columns:
            db.execute('ALTER TABLE scores ADD COLUMN damage_amount REAL NOT NULL DEFAULT 0')
        if 'failure_type' not in columns:
            db.execute('ALTER TABLE scores ADD COLUMN failure_type TEXT NOT NULL DEFAULT "NONE"')
        db.execute('CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC)')

# Auto-initialize DB on startup
init_db()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route('/')
def index():
    """Serve the main game page."""
    return render_template('index.html')


@app.route('/favicon.ico')
def favicon():
    """Serve favicon.ico directly for browsers requesting default favicon."""
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico', mimetype='image/vnd.microsoft.icon')


@app.route('/api/score', methods=['POST'])
def submit_score():
    """Accept a score submission and return the player's rank."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'status': 'error', 'message': 'No JSON payload'}), 400

    required_fields = [
        'player_name', 'score', 'apogee',
        'altitude_accuracy', 'touchdown_speed', 'damage_amount', 'failure_type', 'status',
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

    db = get_db()
    cursor = db.execute(
        '''INSERT INTO scores
           (player_name, score, apogee, altitude_accuracy,
            touchdown_speed, damage_amount, failure_type, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
        (
            player_name[:20] or 'Anonymous',
            score,
            apogee,
            altitude_accuracy,
            touchdown_speed,
            damage_amount,
            failure_type,
            status,
        ),
    )
    db.commit()

    rank = db.execute(
        'SELECT COUNT(*) FROM scores WHERE score > ?',
        (score,),
    ).fetchone()[0] + 1

    return jsonify({'status': 'success', 'score_id': cursor.lastrowid, 'rank': rank})


def _is_admin_request():
    """Check the bearer token without exposing it in a URL or response."""
    if not ADMIN_TOKEN:
        return False
    authorization = request.headers.get('Authorization', '')
    supplied_token = authorization.removeprefix('Bearer ').strip()
    return hmac.compare_digest(supplied_token, ADMIN_TOKEN)


@app.route('/api/admin/scores', methods=['GET'])
def admin_scores():
    """Return score IDs for short-term moderation."""
    if not _is_admin_request():
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401

    rows = get_db().execute(
        '''SELECT id, player_name, score, created_at
           FROM scores ORDER BY created_at DESC LIMIT 100'''
    ).fetchall()
    return jsonify({
        'status': 'success',
        'scores': [dict(row) for row in rows],
    })


@app.route('/api/admin/scores/<int:score_id>', methods=['DELETE'])
def delete_score(score_id):
    """Delete one score from the active temporary SQLite instance."""
    if not _is_admin_request():
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401

    cursor = get_db().execute('DELETE FROM scores WHERE id = ?', (score_id,))
    get_db().commit()
    if cursor.rowcount == 0:
        return jsonify({'status': 'error', 'message': 'Score not found'}), 404
    return jsonify({'status': 'success', 'deleted_id': score_id})


@app.route('/api/leaderboard')
def leaderboard():
    """Return the top-10 scores in descending order."""
    db = get_db()
    rows = db.execute(
        'SELECT * FROM scores ORDER BY score DESC LIMIT 10'
    ).fetchall()

    entries = []
    for i, row in enumerate(rows, 1):
        entries.append({
            'rank':              i,
            'player_name':       row['player_name'],
            'score':             row['score'],
            'apogee':            row['apogee'],
            'altitude_accuracy': row['altitude_accuracy'],
            'touchdown_speed':   row['touchdown_speed'],
            'damage_amount':     row['damage_amount'],
            'failure_type':      row['failure_type'],
            'status':            row['status'],
            'created_at':        row['created_at'],
        })

    return jsonify({'status': 'success', 'leaderboard': entries})


@app.route('/api/health')
def health():
    """Simple health-check endpoint."""
    return jsonify({'status': 'healthy', 'game': 'Thrust The Rocket v1.0'})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5000, debug=True)
    app.run(debug=True, host='0.0.0.0', port=5001)
