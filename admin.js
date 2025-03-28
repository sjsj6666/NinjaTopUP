document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded - Admin Dashboard');

    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    const loginBtn = document.getElementById('login-btn');
    const adminPassword = document.getElementById('admin-password');
    const correctPassword = 'admin123';

    function isLoginValid() {
        const lastLogin = localStorage.getItem('adminLastLogin');
        if (!lastLogin) return false;
        return Date.now() - parseInt(lastLogin, 10) < FIFTEEN_MINUTES;
    }

    function showAdminContent() {
        document.getElementById('admin-login').style.display = 'none';
        document.getElementById('admin-content').style.display = 'block';
        showTab('transactions'); // Default to transactions tab
    }

    function showLoginForm() {
        document.getElementById('admin-login').style.display = 'block';
        document.getElementById('admin-content').style.display = 'none';
    }

    function attemptLogin() {
        if (adminPassword.value.trim() === correctPassword) {
            showNotification('Admin access granted!');
            localStorage.setItem('adminLastLogin', Date.now());
            showAdminContent();
        } else {
            showNotification('Incorrect password!');
        }
    }

    function showTab(tabName) {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.tab === tabName) tab.classList.add('active');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
            if (content.id === tabName) content.classList.add('active');
        });
        if (tabName === 'transactions') showTransactions();
        if (tabName === 'user-management') showUsers();
    }

    if (isLoginValid()) {
        console.log('Admin session still valid, skipping login');
        showAdminContent();
    } else {
        showLoginForm();
    }

    if (loginBtn && adminPassword) {
        loginBtn.addEventListener('click', attemptLogin);
        adminPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') attemptLogin();
        });
    }

    const statusFilter = document.getElementById('status-filter');
    const dateFilter = document.getElementById('date-filter');
    const orderFilter = document.getElementById('order-filter');
    const refreshBtn = document.getElementById('refresh-btn');
    const userSearch = document.getElementById('user-search');
    const userRefreshBtn = document.getElementById('user-refresh-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const tabs = document.querySelectorAll('.tab');

    if (statusFilter) statusFilter.addEventListener('change', applyFilters);
    if (dateFilter) dateFilter.addEventListener('input', applyFilters);
    if (orderFilter) orderFilter.addEventListener('input', applyFilters);
    if (refreshBtn) refreshBtn.addEventListener('click', applyFilters);
    if (userSearch) userSearch.addEventListener('input', applyUserFilters);
    if (userRefreshBtn) userRefreshBtn.addEventListener('click', applyUserFilters);
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            localStorage.removeItem('adminLastLogin');
            showNotification('Logged out successfully!');
            showLoginForm();
        });
    }
    tabs.forEach(tab => {
        tab.addEventListener('click', () => showTab(tab.dataset.tab));
    });

    setInterval(() => {
        if (!isLoginValid() && document.getElementById('admin-content').style.display === 'block') {
            console.log('15-minute session expired');
            localStorage.removeItem('adminLastLogin');
            showNotification('Session expired. Please log in again.');
            showLoginForm();
        }
    }, 60000);
});

function applyFilters() {
    const status = document.getElementById('status-filter').value;
    const date = document.getElementById('date-filter').value;
    const order = document.getElementById('order-filter').value.trim().toUpperCase();
    showTransactions(status, date, order);
}

function applyUserFilters() {
    const search = document.getElementById('user-search').value.trim();
    showUsers(search);
}

const AML_AMOUNT_THRESHOLD = 10000;

async function showTransactions(statusFilter = 'all', dateFilter = '', orderFilter = '') {
    const transactionsDiv = document.getElementById('transactions-list');
    if (!transactionsDiv) return;
    transactionsDiv.innerHTML = '<p>Loading...</p>';

    try {
        let query = window.supabase
            .from('orders')
            .select('orderid, status, created_at, items, total, phone, userid, users!userid(id, email, is_suspended)')
            .order('created_at', { ascending: false });

        if (statusFilter !== 'all') query = query.eq('status', statusFilter);
        if (dateFilter) {
            const startOfDay = new Date(dateFilter).toISOString().split('T')[0] + 'T00:00:00Z';
            const endOfDay = new Date(dateFilter).toISOString().split('T')[0] + 'T23:59:59Z';
            query = query.gte('created_at', startOfDay).lte('created_at', endOfDay);
        }
        if (orderFilter) query = query.ilike('orderid', `%${orderFilter}%`);

        const { data: transactions, error } = await query;
        if (error) throw error;

        transactionsDiv.innerHTML = transactions.length === 0 ? '<p>No transactions found.</p>' : '';
        transactions.forEach((item, index) => {
            const statusClass = {
                'Verifying Payment': 'status-verifying',
                'Processing': 'status-processing',
                'Delivered Successfully': 'status-delivered',
                'Refunded': 'status-refunded'
            }[item.status] || 'status-verifying';

            const isHighValue = item.total > AML_AMOUNT_THRESHOLD ? '<span class="status status-verifying">High Value</span>' : '';
            const userEmail = item.users?.email ? ` (${item.users.email})` : '';

            const itemDiv = document.createElement('div');
            itemDiv.className = 'transaction-item';
            itemDiv.innerHTML = `
                <span class="transaction-number">${index + 1}</span>
                <p><strong>User ID:</strong> ${item.userid || 'Guest'}${userEmail} ${item.users?.is_suspended ? '<span class="status status-refunded">Suspended</span>' : ''}</p>
                <p><strong>Order Status:</strong> <span class="status ${statusClass}">${item.status}</span>
                    <select class="status-select" data-order-id="${item.orderid}">
                        <option value="Verifying Payment" ${item.status === 'Verifying Payment' ? 'selected' : ''}>Verifying Payment</option>
                        <option value="Processing" ${item.status === 'Processing' ? 'selected' : ''}>Processing</option>
                        <option value="Delivered Successfully" ${item.status === 'Delivered Successfully' ? 'selected' : ''}>Delivered Successfully</option>
                        <option value="Refunded" ${item.status === 'Refunded' ? 'selected' : ''}>Refunded</option>
                    </select>
                </p>
                <p><strong>Order Number:</strong> ${item.orderid}, <strong>Date & Time:</strong> ${new Date(item.created_at).toLocaleString()}</p>
                <p><strong>Item Name, Amount:</strong> ${item.items.map(i => `${i.game}: ${i.amount}`).join(', ')}</p>
                <p><strong>Details:</strong> UID: ${item.items.map(i => i.userId).join(', ')}${item.items.some(i => i.server) ? `, Server: ${item.items.map(i => i.server || 'N/A').join(', ')}` : ''}</p>
                <p><strong>Total Paid:</strong> $${item.total} ${isHighValue}</p>
                <p><strong>WhatsApp Number:</strong> ${item.phone || 'Not provided'}</p>
            `;
            transactionsDiv.appendChild(itemDiv);
        });

        document.querySelectorAll('.status-select').forEach(select => {
            select.addEventListener('change', async function() {
                const orderId = this.dataset.orderId;
                const newStatus = this.value;
                try {
                    const { error } = await window.supabase
                        .from('orders')
                        .update({ status: newStatus, updated_at: new Date().toISOString() })
                        .eq('orderid', orderId);
                    if (error) throw error;
                    showNotification(`Order ${orderId} status updated to ${newStatus}`);
                    applyFilters();
                } catch (error) {
                    console.error('Error updating status:', error);
                    showNotification('Error updating status: ' + error.message);
                }
            });
        });
    } catch (error) {
        console.error('Error loading transactions:', error);
        transactionsDiv.innerHTML = `<p>Error loading transactions: ${error.message}</p>`;
    }
}

async function showUsers(searchFilter = '') {
    const usersDiv = document.getElementById('users-list');
    if (!usersDiv) return;
    usersDiv.innerHTML = '<p>Loading...</p>';

    try {
        let query = window.supabase
            .from('users')
            .select('id, email, whatsapp, points, created_at, is_suspended')
            .order('created_at', { ascending: false });

        if (searchFilter) {
            query = query.or(`email.ilike.%${searchFilter}%,id.ilike.%${searchFilter}%`);
        }

        const { data: users, error } = await query;
        if (error) throw error;

        usersDiv.innerHTML = users.length === 0 ? '<p>No users found.</p>' : '';
        users.forEach((user, index) => {
            const userDiv = document.createElement('div');
            userDiv.className = 'transaction-item';
            userDiv.innerHTML = `
                <span class="transaction-number">${index + 1}</span>
                <p><strong>User ID:</strong> ${user.id}</p>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Phone:</strong> ${user.whatsapp || 'Not set'}</p>
                <p><strong>Points:</strong> ${user.points || 0}</p>
                <p><strong>Registered:</strong> ${new Date(user.created_at).toLocaleString()}</p>
                <p><strong>Status:</strong> 
                    <span class="status ${user.is_suspended ? 'status-refunded' : 'status-delivered'}">${user.is_suspended ? 'Suspended' : 'Active'}</span>
                    <button class="suspend-btn" data-user-id="${user.id}" data-action="${user.is_suspended ? 'unsuspend' : 'suspend'}">
                        ${user.is_suspended ? 'Unsuspend' : 'Suspend'}
                    </button>
                </p>
            `;
            usersDiv.appendChild(userDiv);
        });

        document.querySelectorAll('.suspend-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const userId = this.dataset.userId;
                const action = this.dataset.action;
                const isSuspending = action === 'suspend';

                try {
                    const { error } = await window.supabase
                        .from('users')
                        .update({ is_suspended: isSuspending })
                        .eq('id', userId);
                    if (error) throw error;
                    showNotification(`User ${userId} ${isSuspending ? 'suspended' : 'unsuspended'} successfully`);
                    applyUserFilters();
                } catch (error) {
                    console.error(`Error ${isSuspending ? 'suspending' : 'unsuspending'} user:`, error);
                    showNotification('Error: ' + error.message);
                }
            });
        });
    } catch (error) {
        console.error('Error loading users:', error);
        usersDiv.innerHTML = `<p>Error loading users: ${error.message}</p>`;
    }
}

function showNotification(message) {
    const notification = document.getElementById('notification');
    const overlay = document.getElementById('notification-overlay');
    if (!notification || !overlay) return;
    notification.textContent = message;
    notification.style.display = 'block';
    overlay.style.display = 'block';
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.style.display = 'none';
            overlay.style.display = 'none';
        }, 500);
    }, 3000);
}