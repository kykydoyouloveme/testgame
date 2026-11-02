require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('./models/User');
const Verification = require('./models/Verification');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
app.use('/api/auth', authLimiter);
const emailPattern = /^[a-z0-9._%+-]+@gmail\.com$/i;
const validEmail = value => typeof value === 'string' && emailPattern.test(value.trim());
const transporter = () => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) throw new Error('Email service is not configured.');
  return nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
};
const signToken = user => jwt.sign({ sub: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });

app.post('/api/auth/send-code', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ message: 'Gumamit ng valid na @gmail.com address.' });
  try {
    if (await User.exists({ email })) return res.status(409).json({ message: 'May account na para sa Gmail na ito. Mag-login na lang.' });
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    await Verification.findOneAndUpdate({ email }, { email, codeHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0 }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await transporter().sendMail({
      from: `Battle Ground <${process.env.GMAIL_USER}>`, to: email, subject: 'Verify your Battle Ground email',
      text: `Your Battle Ground verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;background:#101713;color:#f5f5e8;padding:32px"><h2>Battle Ground</h2><p>Enter this code to verify your email:</p><div style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#d8ff48">${code}</div><p>This code expires in 10 minutes.</p></div>`
    });
    return res.json({ message: 'Naipadala na ang 6-digit code sa Gmail mo.' });
  } catch (error) {
    console.error('Could not send verification email:', error.message);
    return res.status(503).json({ message: 'Hindi maipadala ang verification email. Tingnan ang Gmail SMTP setup at subukan ulit.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const code = String(req.body.code || '').trim();
  if (username.length < 3 || username.length > 24) return res.status(400).json({ message: 'Username ay dapat 3 hanggang 24 characters.' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ message: 'Letters, numbers, at underscore lang ang puwede sa username.' });
  if (!validEmail(email)) return res.status(400).json({ message: 'Gumamit ng valid na @gmail.com address.' });
  if (password.length < 8) return res.status(400).json({ message: 'Dapat hindi bababa sa 8 characters ang password.' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Ilagay ang 6-digit email verification code.' });
  try {
    const verification = await Verification.findOne({ email });
    if (!verification || verification.expiresAt <= new Date()) return res.status(400).json({ message: 'Wala o expired na ang code. Humingi ng bagong code.' });
    if (verification.attempts >= 5) return res.status(429).json({ message: 'Maraming maling code. Humingi ng bagong code.' });
    if (!(await bcrypt.compare(code, verification.codeHash))) {
      verification.attempts += 1;
      await verification.save();
      return res.status(400).json({ message: 'Mali ang verification code.' });
    }
    if (await User.exists({ $or: [{ email }, { username }] })) return res.status(409).json({ message: 'May gumagamit na ng email o username na iyan.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, email, passwordHash, emailVerified: true });
    await Verification.deleteOne({ _id: verification._id });
    return res.status(201).json({ token: signToken(user), user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'May gumagamit na ng email o username na iyan.' });
    console.error('Registration error:', error.message);
    return res.status(500).json({ message: 'Hindi natuloy ang registration. Subukan ulit.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!validEmail(email)) return res.status(400).json({ message: 'Gumamit ng valid na @gmail.com address.' });
  try {
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Mali ang Gmail o password.' });
    if (!user.emailVerified) return res.status(403).json({ message: 'Kailangan munang ma-verify ang Gmail na ito.' });
    return res.json({ token: signToken(user), user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ message: 'Hindi makapag-login sa ngayon. Subukan ulit.' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || !user.emailVerified) return res.status(401).json({ message: 'Hindi valid ang session.' });
    return res.json({ user: { id: user.id, username: user.username, email: user.email } });
  } catch { return res.status(401).json({ message: 'Hindi valid ang session.' }); }
});

async function start() {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) throw new Error('Set MONGODB_URI and JWT_SECRET in .env');
  await mongoose.connect(process.env.MONGODB_URI);
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Battle Ground auth running at http://localhost:${port}`));
}
start().catch(error => { console.error('Startup error:', error.message); process.exit(1); });
