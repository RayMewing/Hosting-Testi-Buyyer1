const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const JWT_SECRET = process.env.JWT_SECRET || "rahasia_testi_keren";

let cachedDb = null;
async function connectDB() {
    if (cachedDb) return cachedDb;
    const db = await mongoose.connect(process.env.MONGODB_URI);
    cachedDb = db;
    return db;
}

// 1. Schema Testi (Ditambah buyerName)
const TestiSchema = new mongoose.Schema({
    imageUrl: String,
    productName: String,
    buyerName: String, // NAMA PEMBELI
    price: Number,
    uploadedBy: String,
    date: { type: Date, default: Date.now }
});
const Testi = mongoose.models.Testi || mongoose.model('Testi', TestiSchema);

// 2. Schema Pemilik
const OwnerSchema = new mongoose.Schema({ name: String });
const Owner = mongoose.models.Owner || mongoose.model('Owner', OwnerSchema);

// 3. Schema Pengaturan Sistem (Sosmed & Akun)
const SettingsSchema = new mongoose.Schema({
    type: { type: String, default: 'global' },
    adminUser: { type: String, default: 'admin' },
    adminPass: { type: String, default: 'gas123' },
    socials: {
        waChannel: { link: { type: String, default: '' }, active: { type: Boolean, default: false } },
        waOwner: { link: { type: String, default: '' }, active: { type: Boolean, default: false } },
        tiktok: { link: { type: String, default: '' }, active: { type: Boolean, default: false } }
    }
});
const Settings = mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);

const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Akses ditolak!" });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); } 
    catch (err) { res.status(400).json({ error: "Token tidak valid!" }); }
};

// ================= API ROUTES =================

// LOGIN DINAMIS (Cek ke Database Settings)
app.post('/api/login', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    
    // Bikin setting default kalau DB masih kosong
    let settings = await Settings.findOne({ type: 'global' });
    if (!settings) settings = await Settings.create({});

    if (username === settings.adminUser && password === settings.adminPass) {
        return res.json({ token: jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1d' }) });
    }
    res.status(400).json({ error: "Login gagal! Cek lagi bro." });
});

// PENGATURAN SISTEM (Sosmed & Akun)
app.get('/api/settings', async (req, res) => {
    await connectDB();
    let settings = await Settings.findOne({ type: 'global' });
    if (!settings) settings = await Settings.create({});
    // Jangan kirim password ke public
    const publicSettings = { socials: settings.socials };
    res.json(publicSettings);
});

// Update Settings (Auth Required)
app.put('/api/settings', authenticate, async (req, res) => {
    await connectDB();
    const updated = await Settings.findOneAndUpdate({ type: 'global' }, req.body, { new: true, upsert: true });
    res.json({ message: 'Pengaturan disave!', data: updated });
});

// STATS, OWNERS, TESTI (Sama seperti sebelumnya, plus Buyer Name)
app.get('/api/stats', async (req, res) => {
    await connectDB();
    res.json({
        totalTesti: await Testi.countDocuments(),
        totalRevenue: (await Testi.aggregate([{ $group: { _id: null, total: { $sum: "$price" } } }]))[0]?.total || 0
    });
});

app.get('/api/owners', async (req, res) => { await connectDB(); res.json(await Owner.find()); });
app.post('/api/owners', authenticate, async (req, res) => { await connectDB(); res.json(await Owner.create(req.body)); });
app.delete('/api/owners/:id', authenticate, async (req, res) => { await connectDB(); await Owner.findByIdAndDelete(req.params.id); res.json({}); });

app.get('/api/testi', async (req, res) => {
    await connectDB();
    const { admin } = req.query;
    let filter = admin && admin !== 'semua' ? { uploadedBy: { $regex: new RegExp(`^${admin}$`, 'i') } } : {};
    res.json(await Testi.find(filter).sort({ date: -1 }));
});
app.post('/api/testi', authenticate, async (req, res) => { await connectDB(); res.json(await Testi.create(req.body)); });
app.put('/api/testi/:id', authenticate, async (req, res) => { await connectDB(); res.json(await Testi.findByIdAndUpdate(req.params.id, { productName: req.body.productName }, { new: true })); });
app.delete('/api/testi/:id', authenticate, async (req, res) => { await connectDB(); await Testi.findByIdAndDelete(req.params.id); res.json({}); });

module.exports = app;
