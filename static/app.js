const fmt = (n) =>
    '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + type;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'toast'; }, 3500);
}

function profitColor(val) {
    return val >= 0 ? '#16a34a' : '#dc2626';
}

async function loadSummary() {
    try {
        const res = await fetch('/api/summary');
        const d = await res.json();

        document.getElementById('today-income').textContent   = fmt(d.today.income);
        document.getElementById('today-expenses').textContent = fmt(d.today.expenses);

        const profitEl = document.getElementById('today-profit');
        profitEl.textContent = fmt(d.today.profit);
        profitEl.style.color = profitColor(d.today.profit);

        document.getElementById('monthly-income').textContent   = fmt(d.monthly.income);
        document.getElementById('monthly-expenses').textContent = fmt(d.monthly.expenses);
        const mProfit = document.getElementById('monthly-profit');
        mProfit.textContent = fmt(d.monthly.profit);
        mProfit.style.color = profitColor(d.monthly.profit);

        document.getElementById('alltime-income').textContent   = fmt(d.alltime.income);
        document.getElementById('alltime-expenses').textContent = fmt(d.alltime.expenses);
        const aProfit = document.getElementById('alltime-profit');
        aProfit.textContent = fmt(d.alltime.profit);
        aProfit.style.color = profitColor(d.alltime.profit);
    } catch (e) {
        console.error('Failed to load summary', e);
    }
}

function fmtTime(str) {
    // str is "YYYY-MM-DD HH:MM:SS" from SQLite localtime
    const [datePart, timePart] = str.split(' ');
    const [h, m] = timePart.split(':');
    const hour = parseInt(h, 10);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${suffix}`;
}

function makeEntryEl(entry) {
    const div = document.createElement('div');
    div.className = `entry-item ${entry.type}-item`;
    div.dataset.id = entry.id;

    const left = document.createElement('div');
    left.className = 'entry-left';

    const amtSpan = document.createElement('span');
    amtSpan.className = 'entry-amount';
    amtSpan.textContent = fmt(entry.amount);
    left.appendChild(amtSpan);

    if (entry.note) {
        const noteSpan = document.createElement('span');
        noteSpan.className = 'entry-note';
        noteSpan.textContent = entry.note;
        left.appendChild(noteSpan);
    }

    const timeSpan = document.createElement('span');
    timeSpan.className = 'entry-time';
    timeSpan.textContent = fmtTime(entry.created_at);
    left.appendChild(timeSpan);

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.title = 'Delete entry';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => deleteEntry(entry.id));

    div.appendChild(left);
    div.appendChild(delBtn);
    return div;
}

async function loadEntries() {
    try {
        const res = await fetch('/api/entries/today');
        const entries = await res.json();

        const incomeList  = document.getElementById('income-list');
        const expenseList = document.getElementById('expense-list');

        const incomeEntries  = entries.filter(e => e.type === 'income');
        const expenseEntries = entries.filter(e => e.type === 'expense');

        if (incomeEntries.length === 0) {
            incomeList.innerHTML = '<p class="empty-msg">No income entries today</p>';
        } else {
            incomeList.innerHTML = '';
            incomeEntries.forEach(e => incomeList.appendChild(makeEntryEl(e)));
        }

        if (expenseEntries.length === 0) {
            expenseList.innerHTML = '<p class="empty-msg">No expense entries today</p>';
        } else {
            expenseList.innerHTML = '';
            expenseEntries.forEach(e => expenseList.appendChild(makeEntryEl(e)));
        }
    } catch (e) {
        console.error('Failed to load entries', e);
    }
}

async function deleteEntry(id) {
    if (!confirm('Delete this entry?')) return;
    const res = await fetch(`/api/delete_entry/${id}`, { method: 'DELETE' });
    if (res.ok) {
        await Promise.all([loadEntries(), loadSummary()]);
        showToast('Entry deleted', 'error');
    }
}

document.getElementById('income-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = document.getElementById('income-amount').value;
    const note   = document.getElementById('income-note').value;

    const res = await fetch('/api/add_entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'income', amount, note })
    });

    if (res.ok) {
        e.target.reset();
        await Promise.all([loadEntries(), loadSummary()]);
        showToast('Income added!', 'success');
    } else {
        const err = await res.json();
        showToast(err.error || 'Error adding income', 'error');
    }
});

document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = document.getElementById('expense-amount').value;
    const note   = document.getElementById('expense-note').value;

    const res = await fetch('/api/add_entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'expense', amount, note })
    });

    if (res.ok) {
        e.target.reset();
        await Promise.all([loadEntries(), loadSummary()]);
        showToast('Expense added!', 'success');
    } else {
        const err = await res.json();
        showToast(err.error || 'Error adding expense', 'error');
    }
});

async function sendWhatsApp() {
    const btn = document.getElementById('send-whatsapp-btn');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
        const res  = await fetch('/api/send_whatsapp', { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            showToast('WhatsApp summary sent!', 'success');
        } else {
            showToast(data.error || 'Failed to send WhatsApp', 'error');
        }
    } catch (e) {
        showToast('Network error — could not send', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '📱 Send WhatsApp Summary';
    }
}

// Set header date
document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

// Initial load
loadSummary();
loadEntries();
