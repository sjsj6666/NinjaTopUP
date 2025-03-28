const express = require('express');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/time', (req, res) => {
    res.json({ time: new Date().toISOString() });
});

app.get('/api/proxy-smile/:game/:uid/:server', async (req, res) => {
    const { game, uid, server } = req.params;
    const proxyUrl = `https://ninja-flask-backend.onrender.com/check-smile/${game}/${uid}/${server}`;
    try {
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/validate-order', async (req, res) => {
    try {
        const { items, total, email, phone } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "No items in order" });
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: "Invalid email" });
        }
        if (!phone || !/^\+\d{8,15}$/.test(phone)) {
            return res.status(400).json({ error: "Invalid phone number" });
        }
        if (total <= 0) {
            return res.status(400).json({ error: "Invalid total amount" });
        }

        const maxTransactionLimit = 10000;
        if (total > maxTransactionLimit) {
            return res.status(403).json({ error: "Transaction exceeds limit. Contact support." });
        }

        res.json({ message: "Order validated successfully" });
    } catch (error) {
        res.status(500).json({ error: `Error validating order: ${error.message}` });
    }
});

app.post('/api/send-notification', async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!phone || !message) {
            return res.status(400).json({ error: "Missing phone or message" });
        }

        console.log(`Sending WhatsApp to ${phone}: ${message}`);
        res.json({ message: "Notification sent successfully" });
    } catch (error) {
        res.status(500).json({ error: `Error sending notification: ${error.message}` });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});