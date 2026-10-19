"""
Thrust The Rocket — Flask Backend
=================================
Serves the game frontend and provides REST API endpoints for
score submission and leaderboard retrieval using SQLite.
"""

import os
import sqlite3
import tempfile
from flask import Flask, render_template, request, jsonify, g, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'templates'),
    static_folder=os.path.join(BASE_DIR, 'static')
)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

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


def get_db():
    """Return a per-request database connection."""
    if 'db' not in g:
        init_db()
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception):
    """Close the database connection at the end of each request."""
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    """Create tables, indices, and seed defaults if empty."""
    os.makedirs(os.path.dirname(os.path.abspath(DATABASE)), exist_ok=True)
    db = sqlite3.connect(DATABASE)
    db.execute('''
        CREATE TABLE IF NOT EXISTS scores (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name       TEXT    NOT NULL DEFAULT 'Anonymous',
            score             INTEGER NOT NULL,
            apogee            REAL    NOT NULL,
            altitude_accuracy REAL    NOT NULL,
            touchdown_speed   REAL    NOT NULL,
            pad_offset        REAL    NOT NULL,
            status            TEXT    NOT NULL CHECK(status IN ('LANDED','DAMAGED','CRASHED')),
            created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    db.execute('CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC)')
    
    # Seed top historical flight records if empty
    count = db.execute('SELECT COUNT(*) FROM scores').fetchone()[0]
    if count == 0:
        seed_data = [
            ('Apollo Commander', 9840, 10008.2, 99.92, 4.2, 0.8, 'LANDED'),
            ('Neil A.',          9520, 10045.0, 99.55, 6.1, 1.4, 'LANDED'),
            ('Buzz A.',          9180,  9930.5, 99.30, 7.8, 2.2, 'LANDED'),
            ('Sally R.',         8750, 10120.0, 98.80, 9.4, 3.1, 'LANDED'),
            ('Major Tom',        8150, 10042.3, 99.58, 8.3, 2.1, 'LANDED'),
        ]
        db.executemany('''
            INSERT INTO scores 
            (player_name, score, apogee, altitude_accuracy, touchdown_speed, pad_offset, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', seed_data)

    db.commit()
    db.close()

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
                               'Logo.ico', mimetype='image/vnd.microsoft.icon')


@app.route('/api/score', methods=['POST'])
def submit_score():
    """Accept a score submission and return the player's rank."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'status': 'error', 'message': 'No JSON payload'}), 400

    required_fields = [
        'player_name', 'score', 'apogee',
        'altitude_accuracy', 'touchdown_speed', 'pad_offset', 'status',
    ]
    for field in required_fields:
        if field not in data:
            return jsonify({'status': 'error', 'message': f'Missing: {field}'}), 400

    db = get_db()
    cursor = db.execute(
        '''INSERT INTO scores
           (player_name, score, apogee, altitude_accuracy,
            touchdown_speed, pad_offset, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)''',
        (
            str(data['player_name'])[:20] or 'Anonymous',
            int(data['score']),
            float(data['apogee']),
            float(data['altitude_accuracy']),
            float(data['touchdown_speed']),
            float(data['pad_offset']),
            data['status'],
        ),
    )
    db.commit()

    rank = db.execute(
        'SELECT COUNT(*) FROM scores WHERE score > ?',
        (int(data['score']),),
    ).fetchone()[0] + 1

    return jsonify({'status': 'success', 'score_id': cursor.lastrowid, 'rank': rank})


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
            'pad_offset':        row['pad_offset'],
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
    app.run(debug=True, host='0.0.0.0', port=5001)
