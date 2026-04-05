const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Sambung ke MongoDB dengan caching untuk Vercel Serverless
let cachedDb = null;
async function connectDB() {
    if (cachedDb) return cachedDb;
    const db = await mongoose.connect(process.env.MONGODB_URI);
    cachedDb = db;
    return db;
}

// Bikin Struktur Data (Schema)
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['superadmin', 'admin'], default: 'admin' }
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const TestiSchema = new mongoose.Schema({
    imageUrl: String,
    productName: String,
    price: Number,
    uploadedBy: String,
    date: { type: Date, default: Date.now }
});
const Testi = mongoose.models.Testi || mongoose.model('Testi', TestiSchema);

// JWT Middleware (Satpam yang ngecek Token Login)
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Akses ditolak, belum login!" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'rahasia_negara');
        req.user = decoded;
        next();
    } catch (err) { res.status(400).json({ error: "Token tidak valid!" }); }
};

// ================= API ROUTES =================

// 1. Inisialisasi Superadmin Pertama (Jalan otomatis kalau blm ada user)
app.get('/api/init', async (req, res) => {
    await connectDB();
    const count = await User.countDocuments();
    if (count === 0) {
        const hashedPassword = await bcrypt.hash("admin123", 10);
        await User.create({ username: "ray", password: hashedPassword, role: "superadmin" });
        return res.json({ message: "Superadmin 'ray' berhasil dibuat dengan password 'admin123'" });
    }
    res.json({ message: "Sistem sudah diinisialisasi sebelumnya." });
});

// 2. Login
app.post('/api/login', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "Username tidak ditemukan" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Password salah!" });

    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, process.env.JWT_SECRET || 'rahasia_negara', { expiresIn: '1d' });
    res.json({ message: "Login sukses!", token, role: user.role, username: user.username });
});

// 3. Tambah Admin Baru (Khusus Superadmin)
app.post('/api/users', authenticate, async (req, res) => {
    await connectDB();
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: "Hanya superadmin yang bisa tambah admin!" });
    
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({ username, password: hashedPassword, role: 'admin' });
        res.json({ message: "Admin baru berhasil dibuat!", data: newUser });
    } catch (err) { res.status(400).json({ error: "Username mungkin sudah ada." }); }
});

// 4. Ambil Testi (Public)
app.get('/api/testi', async (req, res) => {
    await connectDB();
    const { admin } = req.query;
    let filter = {};
    if (admin && admin !== 'semua') filter.uploadedBy = admin;
    const data = await Testi.find(filter).sort({ date: -1 });
    res.json(data);
});

// 5. Tambah Testi Baru (Auth)
app.post('/api/testi', authenticate, async (req, res) => {
    await connectDB();
    try {
        // Otomatis pakai nama admin yang lagi login
        const newTesti = new Testi({ ...req.body, uploadedBy: req.user.username });
        await newTesti.save();
        res.json({ message: 'Berhasil upload testi!', data: newTesti });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. Edit Nama Testi (Hanya milik sendiri)
app.put('/api/testi/:id', authenticate, async (req, res) => {
    await connectDB();
    try {
        const testi = await Testi.findOneAndUpdate(
            { _id: req.params.id, uploadedBy: req.user.username }, // Cek kepemilikan
            { productName: req.body.productName },
            { new: true }
        );
        if (!testi) return res.status(403).json({ error: "Gagal edit. Ini bukan testi lu!" });
        res.json({ message: 'Berhasil diupdate!', data: testi });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. Hapus Testi (Hanya milik sendiri)
app.delete('/api/testi/:id', authenticate, async (req, res) => {
    await connectDB();
    try {
        const testi = await Testi.findOneAndDelete({ _id: req.params.id, uploadedBy: req.user.username });
        if (!testi) return res.status(403).json({ error: "Gagal hapus. Ini bukan testi lu!" });
        res.json({ message: 'Testi berhasil dihapus!' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = app;
