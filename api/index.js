const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
// PENTING: Gedein limit JSON biar bisa nerima foto Base64
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "gas123";
const JWT_SECRET = process.env.JWT_SECRET || "rahasia_testi_keren";

let cachedDb = null;
async function connectDB() {
    if (cachedDb) return cachedDb;
    const db = await mongoose.connect(process.env.MONGODB_URI);
    cachedDb = db;
    return db;
}

const TestiSchema = new mongoose.Schema({
    imageUrl: String, // Sekarang ini bakal nyimpen kode Base64 Fotonya langsung!
    productName: String,
    price: Number,
    uploadedBy: String,
    date: { type: Date, default: Date.now }
});
const Testi = mongoose.models.Testi || mongoose.model('Testi', TestiSchema);

const OwnerSchema = new mongoose.Schema({ name: String });
const Owner = mongoose.models.Owner || mongoose.model('Owner', OwnerSchema);

const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Akses ditolak!" });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); } 
    catch (err) { res.status(400).json({ error: "Token tidak valid!" }); }
};

// ================= API ROUTES =================

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        return res.json({ message: "Welcome!", token: jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1d' }) });
    }
    res.status(400).json({ error: "Login gagal!" });
});

// API STATISTIK (Baru!)
app.get('/api/stats', async (req, res) => {
    await connectDB();
    const totalTesti = await Testi.countDocuments();
    const totalValue = await Testi.aggregate([{ $group: { _id: null, total: { $sum: "$price" } } }]);
    res.json({
        totalTesti,
        totalRevenue: totalValue.length > 0 ? totalValue[0].total : 0
    });
});

app.get('/api/owners', async (req, res) => { await connectDB(); res.json(await Owner.find()); });
app.post('/api/owners', authenticate, async (req, res) => { await connectDB(); res.json(await Owner.create({ name: req.body.name })); });
app.delete('/api/owners/:id', authenticate, async (req, res) => { await connectDB(); await Owner.findByIdAndDelete(req.params.id); res.json({ message: 'Dihapus!' }); });

app.get('/api/testi', async (req, res) => {
    await connectDB();
    const { admin } = req.query;
    let filter = {};
    if (admin && admin !== 'semua') filter.uploadedBy = { $regex: new RegExp(`^${admin}$`, 'i') };
    res.json(await Testi.find(filter).sort({ date: -1 }));
});

app.post('/api/testi', authenticate, async (req, res) => {
    await connectDB();
    res.json({ message: 'Berhasil upload!', data: await Testi.create(req.body) });
});
app.put('/api/testi/:id', authenticate, async (req, res) => {
    await connectDB();
    res.json(await Testi.findByIdAndUpdate(req.params.id, { productName: req.body.productName }, { new: true }));
});
app.delete('/api/testi/:id', authenticate, async (req, res) => {
    await connectDB();
    await Testi.findByIdAndDelete(req.params.id);
    res.json({ message: 'Terhapus!' });
});

module.exports = app;
