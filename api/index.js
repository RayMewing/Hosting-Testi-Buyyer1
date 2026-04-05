const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// DATA LOGIN BARENGAN (Hardcoded di sini)
// ==========================================
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "gas123";
const JWT_SECRET = process.env.JWT_SECRET || "rahasia_testi_keren";

// Sambung ke MongoDB untuk Serverless Vercel
let cachedDb = null;
async function connectDB() {
    if (cachedDb) return cachedDb;
    const db = await mongoose.connect(process.env.MONGODB_URI);
    cachedDb = db;
    return db;
}

// Hanya ada 1 Schema: TESTIMONI
const TestiSchema = new mongoose.Schema({
    imageUrl: String,
    productName: String,
    price: Number,
    uploadedBy: String, // Buat nandain ini punya Ray atau Vald
    date: { type: Date, default: Date.now }
});
const Testi = mongoose.models.Testi || mongoose.model('Testi', TestiSchema);

// Middleware Cek Token
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Belum login bro!" });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) { res.status(400).json({ error: "Token expired atau salah!" }); }
};

// ================= API ROUTES =================

// 1. Login (Cek dari data di atas)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
        return res.json({ message: "Berhasil masuk!", token });
    }
    res.status(400).json({ error: "Username atau Password salah bro!" });
});

// 2. Ambil Testi (Public)
app.get('/api/testi', async (req, res) => {
    await connectDB();
    const { admin } = req.query;
    let filter = {};
    if (admin && admin !== 'semua') filter.uploadedBy = { $regex: new RegExp(`^${admin}$`, 'i') };
    const data = await Testi.find(filter).sort({ date: -1 });
    res.json(data);
});

// 3. Tambah Testi (Butuh Login)
app.post('/api/testi', authenticate, async (req, res) => {
    await connectDB();
    try {
        const newTesti = await Testi.create(req.body);
        res.json({ message: 'Berhasil upload!', data: newTesti });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. Edit Nama Testi (Butuh Login)
app.put('/api/testi/:id', authenticate, async (req, res) => {
    await connectDB();
    try {
        const updated = await Testi.findByIdAndUpdate(req.params.id, { productName: req.body.productName }, { new: true });
        res.json({ message: 'Berhasil update!', data: updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. Hapus Testi (Butuh Login)
app.delete('/api/testi/:id', authenticate, async (req, res) => {
    await connectDB();
    try {
        await Testi.findByIdAndDelete(req.params.id);
        res.json({ message: 'Terhapus!' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = app;
