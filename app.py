from flask import Flask, render_template, request, jsonify, send_file
import sqlite3
import csv
import io
from datetime import date, datetime
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), 'pharmacy.db')


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
            amount REAL NOT NULL,
            note TEXT DEFAULT '',
            created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
        )
    ''')
    conn.commit()
    conn.close()


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@app.route('/')
def entry_page():
    return render_template('entry.html')


@app.route('/dashboard')
def dashboard_page():
    return render_template('dashboard.html')


@app.route('/import')
def import_page():
    return render_template('import.html')


@app.route('/api/add_entry', methods=['POST'])
def add_entry():
    data = request.get_json()
    entry_type = data.get('type')
    note = (data.get('note') or '').strip()

    if entry_type not in ('income', 'expense'):
        return jsonify({'error': 'Invalid entry type'}), 400
    try:
        amount = float(data.get('amount'))
        if amount <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({'error': 'Amount must be a positive number'}), 400

    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO entries (type, amount, note) VALUES (?, ?, ?)',
        (entry_type, amount, note)
    )
    row = conn.execute('SELECT * FROM entries WHERE id = ?', (cursor.lastrowid,)).fetchone()
    conn.commit()
    conn.close()
    return jsonify(dict(row))


@app.route('/api/entries/today')
def today_entries():
    today = date.today().isoformat()
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM entries WHERE date(created_at) = ? ORDER BY created_at DESC",
        (today,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/entries/all')
def all_entries():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM entries ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/summary')
def summary():
    today = date.today().isoformat()
    month = date.today().strftime('%Y-%m')
    conn = get_db()

    def totals(where, params):
        inc = conn.execute(
            f"SELECT COALESCE(SUM(amount),0) FROM entries WHERE type='income' AND {where}", params
        ).fetchone()[0]
        exp = conn.execute(
            f"SELECT COALESCE(SUM(amount),0) FROM entries WHERE type='expense' AND {where}", params
        ).fetchone()[0]
        return {'income': inc, 'expenses': exp, 'profit': inc - exp}

    result = {
        'today':   totals("date(created_at) = ?", (today,)),
        'monthly': totals("strftime('%Y-%m', created_at) = ?", (month,)),
        'alltime': totals("1=1", ()),
    }
    conn.close()
    return jsonify(result)


@app.route('/api/delete_entry/<int:entry_id>', methods=['DELETE'])
def delete_entry(entry_id):
    conn = get_db()
    conn.execute('DELETE FROM entries WHERE id = ?', (entry_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/import_csv', methods=['POST'])
def import_csv():
    file = request.files.get('csvfile')
    if not file:
        return jsonify({'error': 'No file uploaded'}), 400

    try:
        content = file.read().decode('utf-8-sig')
    except UnicodeDecodeError:
        return jsonify({'error': 'File must be UTF-8 encoded. Save your Excel as CSV UTF-8.'}), 400

    reader = csv.DictReader(io.StringIO(content))
    reader.fieldnames = [f.strip().lower() for f in (reader.fieldnames or [])]

    required = {'date', 'type', 'amount'}
    if not required.issubset(set(reader.fieldnames)):
        return jsonify({
            'error': f'CSV must have columns: date, type, amount (and optionally note). Found: {reader.fieldnames}'
        }), 400

    imported, skipped, errors = 0, 0, []
    conn = get_db()

    for i, row in enumerate(reader, 2):
        try:
            raw_date = row.get('date', '').strip()
            raw_type = row.get('type', '').strip().lower()
            raw_amt  = row.get('amount', '').strip().replace(',', '').replace('₹', '').replace('Rs', '').replace('rs', '')
            note     = row.get('note', '').strip()

            if not raw_date and not raw_amt:
                skipped += 1
                continue

            parsed_date = None
            for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%m/%d/%Y'):
                try:
                    parsed_date = datetime.strptime(raw_date, fmt).strftime('%Y-%m-%d')
                    break
                except ValueError:
                    continue
            if not parsed_date:
                errors.append(f'Row {i}: unrecognised date "{raw_date}"')
                continue

            if raw_type not in ('income', 'expense'):
                errors.append(f'Row {i}: type must be "income" or "expense", got "{raw_type}"')
                continue

            amount = float(raw_amt)
            if amount <= 0:
                errors.append(f'Row {i}: amount must be positive')
                continue

            conn.execute(
                "INSERT INTO entries (type, amount, note, created_at) VALUES (?, ?, ?, ?)",
                (raw_type, amount, note, parsed_date + ' 00:00:00')
            )
            imported += 1
        except (ValueError, KeyError) as e:
            errors.append(f'Row {i}: {e}')

    conn.commit()
    conn.close()
    return jsonify({'imported': imported, 'skipped': skipped, 'errors': errors})


@app.route('/api/template_csv')
def template_csv():
    rows = [
        ['date', 'type', 'amount', 'note'],
        ['2026-05-01', 'income', '5000', 'Morning sales'],
        ['2026-05-01', 'expense', '800', 'Supplier payment'],
    ]
    output = io.StringIO()
    csv.writer(output).writerows(rows)
    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name='pharmacy_import_template.csv'
    )


if __name__ == '__main__':
    init_db()
    port = int(os.getenv('PORT', 8080))
    app.run(debug=False, host='0.0.0.0', port=port)
