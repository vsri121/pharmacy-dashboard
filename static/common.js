const fmt = (n) =>
    '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtTime(str) {
    const [, timePart] = str.split(' ');
    const [h, m] = timePart.split(':');
    const hour = parseInt(h, 10);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + type;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'toast'; }, 3000);
}

function updateMiniStats(today) {
    const incEl  = document.getElementById('mini-income');
    const expEl  = document.getElementById('mini-expenses');
    const profEl = document.getElementById('mini-profit');
    if (incEl)  incEl.textContent  = fmt(today.income);
    if (expEl)  expEl.textContent  = fmt(today.expenses);
    if (profEl) {
        profEl.textContent = fmt(today.profit);
        profEl.style.color = today.profit >= 0 ? '#16a34a' : '#dc2626';
    }
}

function makeEntryEl(entry, onDelete) {
    const div = document.createElement('div');
    div.className = `entry-item ${entry.type}-item`;

    const left = document.createElement('div');
    left.className = 'entry-left';

    const amt = document.createElement('span');
    amt.className = 'entry-amount';
    amt.textContent = fmt(entry.amount);
    left.appendChild(amt);

    if (entry.note) {
        const note = document.createElement('span');
        note.className = 'entry-note';
        note.textContent = entry.note;
        left.appendChild(note);
    }

    const time = document.createElement('span');
    time.className = 'entry-time';
    time.textContent = fmtTime(entry.created_at);
    left.appendChild(time);

    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.title = 'Delete';
    del.textContent = '✕';
    del.addEventListener('click', () => onDelete(entry.id));

    div.appendChild(left);
    div.appendChild(del);
    return div;
}

async function deleteEntryShared(id, onDone) {
    if (!confirm('Delete this entry?')) return;
    await fetch(`/api/delete_entry/${id}`, { method: 'DELETE' });
    showToast('Deleted', 'error');
    if (onDone) onDone();
}

function renderTodayLists(entries, onDelete) {
    const incomeList  = document.getElementById('income-list');
    const expenseList = document.getElementById('expense-list');
    if (!incomeList || !expenseList) return;

    const handleDelete = onDelete || (async (id) => {
        if (!confirm('Delete this entry?')) return;
        await fetch(`/api/delete_entry/${id}`, { method: 'DELETE' });
        showToast('Deleted', 'error');
        const fresh = await fetch('/api/entries/today').then(r => r.json());
        renderTodayLists(fresh, handleDelete);
        const summary = await fetch('/api/summary').then(r => r.json());
        updateMiniStats(summary.today);
    });

    const inc = entries.filter(e => e.type === 'income');
    const exp = entries.filter(e => e.type === 'expense');

    if (inc.length === 0) {
        incomeList.innerHTML = '<p class="empty-msg">No income entries today</p>';
    } else {
        incomeList.innerHTML = '';
        inc.forEach(e => incomeList.appendChild(makeEntryEl(e, handleDelete)));
    }

    if (exp.length === 0) {
        expenseList.innerHTML = '<p class="empty-msg">No expense entries today</p>';
    } else {
        expenseList.innerHTML = '';
        exp.forEach(e => expenseList.appendChild(makeEntryEl(e, handleDelete)));
    }
}
