const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const PORT_PROTOCOL_MAP = {
  '20': 'FTP-Data',
  '21': 'FTP',
  '22': 'SSH',
  '23': 'Telnet',
  '25': 'SMTP',
  '53': 'DNS',
  '80': 'HTTP',
  '110': 'POP3',
  '143': 'IMAP',
  '443': 'HTTPS',
  '465': 'SMTPS',
  '993': 'IMAPS',
  '995': 'POP3S',
  '1433': 'MSSQL',
  '3306': 'MySQL',
  '3389': 'RDP',
  '5432': 'PostgreSQL',
  '8080': 'HTTP-Alt',
  '27017': 'MongoDB'
};

function getFriendlyProtocol(port, baseProtocol) {
  const cleanProto = (baseProtocol || 'tcp').toLowerCase();
  const cleanPort = port ? port.toString().trim() : '';
  if (cleanProto === 'tcp' || cleanProto === 'udp') {
    if (PORT_PROTOCOL_MAP[cleanPort]) {
      return PORT_PROTOCOL_MAP[cleanPort];
    }
  }
  return baseProtocol.toUpperCase();
}

const app = express();
const PORT = process.env.PORT || 80;


app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BASE_DIR = '/home/ubuntu';
const DEPLOYMENTS_DIR = path.join(BASE_DIR, 'deployments');
const DB_FILE = path.join(BASE_DIR, 'deployments.json');
const VPC_DEPLOYMENTS_DIR = path.join(BASE_DIR, 'vpc-deployments');
const VPC_DB_FILE = path.join(BASE_DIR, 'vpcs.json');
const S3_DEPLOYMENTS_DIR = path.join(BASE_DIR, 's3-deployments');
const S3_DB_FILE = path.join(BASE_DIR, 's3buckets.json');

function safeRmSync(dirPath) {
  if (fs.rmSync) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } else if (fs.rmdirSync) {
    fs.rmdirSync(dirPath, { recursive: true });
  }
}

// Ensure directories and DB files exist
if (!fs.existsSync(DEPLOYMENTS_DIR)) {
  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([]));
}
if (!fs.existsSync(VPC_DEPLOYMENTS_DIR)) {
  fs.mkdirSync(VPC_DEPLOYMENTS_DIR, { recursive: true });
}
if (!fs.existsSync(VPC_DB_FILE)) {
  fs.writeFileSync(VPC_DB_FILE, JSON.stringify([]));
}
if (!fs.existsSync(S3_DEPLOYMENTS_DIR)) {
  fs.mkdirSync(S3_DEPLOYMENTS_DIR, { recursive: true });
}
if (!fs.existsSync(S3_DB_FILE)) {
  fs.writeFileSync(S3_DB_FILE, JSON.stringify([]));
}
const CF_DEPLOYMENTS_DIR = path.join(BASE_DIR, 'cf-deployments');
const CF_DB_FILE = path.join(BASE_DIR, 'distributions.json');
if (!fs.existsSync(CF_DEPLOYMENTS_DIR)) {
  fs.mkdirSync(CF_DEPLOYMENTS_DIR, { recursive: true });
}
if (!fs.existsSync(CF_DB_FILE)) {
  fs.writeFileSync(CF_DB_FILE, JSON.stringify([]));
}

const ECS_DEPLOYMENTS_DIR = path.join(BASE_DIR, 'ecs-deployments');
const ECS_DB_FILE = path.join(BASE_DIR, 'ecs_deployments.json');
if (!fs.existsSync(ECS_DEPLOYMENTS_DIR)) {
  fs.mkdirSync(ECS_DEPLOYMENTS_DIR, { recursive: true });
}
if (!fs.existsSync(ECS_DB_FILE)) {
  fs.writeFileSync(ECS_DB_FILE, JSON.stringify([]));
}

function readEcsDB() {
  try { return JSON.parse(fs.readFileSync(ECS_DB_FILE, 'utf8')); } catch (e) { return []; }
}
function writeEcsDB(data) { fs.writeFileSync(ECS_DB_FILE, JSON.stringify(data, null, 2)); }

const USERS_FILE = path.join(BASE_DIR, 'users.json');
const SESSIONS_FILE = path.join(BASE_DIR, 'sessions.json');
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(SESSIONS_FILE)) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
}

function readUsersDB() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch (e) { return []; }
}
function writeUsersDB(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}
function readSessionsDB() {
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch (e) { return []; }
}
function writeSessionsDB(data) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
}

// Migration: Ensure Joy Debnath is Admin & isVerified is true by default
(function migrateUsers() {
  try {
    const users = readUsersDB();
    let updated = false;
    users.forEach(u => {
      if (u.email.toLowerCase() === 'joy.debnath@webskitters.com') {
        if (!u.isAdmin) {
          u.isAdmin = true;
          updated = true;
        }
      }
      if (u.isVerified === undefined) {
        u.isVerified = true;
        updated = true;
      }
    });
    if (updated) {
      writeUsersDB(users);
      console.log('User database migrated: Admin privileges granted to Joy Debnath and verification flags verified.');
    }
  } catch (err) {
    console.error('Migration error:', err);
  }
})();


function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// Mail transporter configuration & mock logging fallback
let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

const EMAILS_LOG_FILE = path.join(BASE_DIR, 'sent_emails.log');

async function sendVerificationEmail(name, email, token, host) {
  const verifyLink = `http://${host}/api/auth/verify?token=${token}`;
  const subject = 'Verify your email address — AWS Control Panel';
  const textContent = `Hi ${name},\n\nPlease verify your email address by clicking on the link below:\n${verifyLink}\n\nThanks,\nAWS Control Panel Admin`;
  
  const htmlContent = `
    <div style="font-family: 'Inter', sans-serif; background: #0d1117; color: #c9d1d9; padding: 40px; text-align: center; border-radius: 8px; border: 1px solid #30363d; max-width: 500px; margin: 0 auto;">
      <h2 style="color: #f78166; margin-bottom: 20px;">AWS Cloud Control Panel</h2>
      <p style="font-size: 15px; color: #8b949e; text-align: left;">Hi <strong>${name}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.6; text-align: left; color: #c9d1d9;">Thank you for registering! Please verify your email address by clicking the button below:</p>
      <div style="margin: 30px 0;">
        <a href="${verifyLink}" style="background: #238636; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 14px;">Verify Email Address</a>
      </div>
      <p style="font-size: 12px; color: #8b949e; text-align: left;">If the button doesn't work, copy and paste this link in your browser:</p>
      <p style="font-size: 12px; font-family: monospace; word-break: break-all; color: #58a6ff; text-align: left; background: #161b22; padding: 10px; border-radius: 4px; border: 1px solid #21262d;">${verifyLink}</p>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"AWS Control Panel" <noreply@controlpanel.local>',
        to: email,
        subject: subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`Verification email sent successfully to ${email}`);
      return;
    } catch (err) {
      console.error(`Failed to send real verification email to ${email}, falling back to mock:`, err);
    }
  }

  // Fallback to Mock Log File
  const logEntry = `\n[${new Date().toISOString()}] =========================================\n` +
                   `TO: ${email} (${name})\n` +
                   `SUBJECT: ${subject}\n` +
                   `LINK: ${verifyLink}\n` +
                   `==================================================================\n`;
  fs.appendFileSync(EMAILS_LOG_FILE, logEntry, 'utf8');
  console.log(`[MOCK EMAIL] Verification link generated for ${email}: ${verifyLink}`);
}

function renderVerificationHtml(success, message) {
  const title = success ? 'Verification Successful' : 'Verification Failed';
  const color = success ? '#3fb950' : '#f85149';
  const icon = success 
    ? `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`
    : `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} — AWS Control Panel</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
      <style>
        body {
          margin: 0;
          padding: 0;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at center, #161b22 0%, #0d1117 100%);
          font-family: 'Inter', sans-serif;
          color: #c9d1d9;
        }
        .container {
          width: 100%;
          max-width: 400px;
          background: rgba(22, 27, 34, 0.8);
          border: 1px solid #30363d;
          border-radius: 12px;
          padding: 40px 32px;
          text-align: center;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(12px);
        }
        .icon {
          margin-bottom: 24px;
        }
        h2 {
          font-size: 22px;
          font-weight: 600;
          color: #f0f6fc;
          margin: 0 0 12px;
        }
        p {
          font-size: 14px;
          color: #8b949e;
          line-height: 1.6;
          margin: 0 0 32px;
        }
        .btn {
          display: inline-block;
          background: #238636;
          color: #ffffff;
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          border-radius: 6px;
          transition: background-color 0.15s;
        }
        .btn:hover {
          background-color: #2ea043;
        }
        .btn-error {
          background: #21262d;
          border: 1px solid #30363d;
          color: #c9d1d9;
        }
        .btn-error:hover {
          background-color: #30363d;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">${icon}</div>
        <h2>${title}</h2>
        <p>${message}</p>
        <a href="/" class="btn ${success ? '' : 'btn-error'}">${success ? 'Proceed to Login' : 'Back to Login'}</a>
      </div>
    </body>
    </html>
  `;
}

// Auth Middleware
function requireAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Missing token.' });
  }
  const sessions = readSessionsDB();
  const session = sessions.find(s => s.token === token);
  if (!session || new Date(session.expiresAt) < new Date()) {
    if (session) {
      writeSessionsDB(sessions.filter(s => s.token !== token));
    }
    return res.status(401).json({ error: 'Unauthorized. Invalid or expired token.' });
  }
  req.userEmail = session.email;
  next();
}

// Apply Auth Middleware to all /api/ routes except auth and streams
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login' || req.path === '/auth/signup' || req.path === '/stream-logs' || req.path === '/auth/verify') {
    return next();
  }
  requireAuth(req, res, next);
});

// === AUTH ENDPOINTS ===

// 1. Sign Up
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const users = readUsersDB();
  const lowerEmail = email.toLowerCase().trim();
  if (users.find(u => u.email.toLowerCase() === lowerEmail)) {
    return res.status(400).json({ error: 'Email ID already registered' });
  }

  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  const verificationToken = crypto.randomBytes(32).toString('hex');

  const newUser = {
    name: name.trim(),
    email: lowerEmail,
    salt,
    passwordHash,
    isVerified: false,
    verificationToken,
    permissions: {
      ec2: ['read'],
      vpc: ['read'],
      s3: ['read'],
      cf: ['read'],
      ecs: ['read'],
      billing: ['read']
    },
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeUsersDB(users);

  // Send verification email asynchronously
  sendVerificationEmail(newUser.name, newUser.email, verificationToken, req.headers.host)
    .catch(err => console.error('Error sending verification mail:', err));

  const verifyLink = `http://${req.headers.host}/api/auth/verify?token=${verificationToken}`;
  res.json({
    message: 'Registration successful! Please check your email to verify your account.',
    verificationLink: verifyLink
  });
});

// 2. Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const users = readUsersDB();
  const lowerEmail = email.toLowerCase().trim();
  const user = users.find(u => u.email.toLowerCase() === lowerEmail);

  if (!user) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }

  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }

  // Check email verification status
  if (user.isVerified === false) {
    return res.status(400).json({ error: 'Please verify your email address before logging in.' });
  }

  // Create session token
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = readSessionsDB();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours

  sessions.push({
    token,
    email: user.email,
    expiresAt: expiresAt.toISOString()
  });
  writeSessionsDB(sessions);

  res.json({
    message: 'Login successful',
    token,
    user: {
      name: user.name,
      email: user.email,
      isAdmin: !!user.isAdmin,
      permissions: user.isAdmin ? { ec2: ['read','write','execute'], vpc: ['read','write','execute'], s3: ['read','write','execute'], cf: ['read','write','execute'], ecs: ['read','write','execute'] } : (user.permissions || {})
    }
  });
});

// 3. Logout
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const sessions = readSessionsDB();
    writeSessionsDB(sessions.filter(s => s.token !== token));
  }
  res.json({ message: 'Logged out successfully' });
});

// 4. Me (Verify Session)
app.get('/api/auth/me', (req, res) => {
  const users = readUsersDB();
  const user = users.find(u => u.email === req.userEmail);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({
    name: user.name,
    email: user.email,
    isAdmin: !!user.isAdmin,
    permissions: user.isAdmin ? { ec2: ['read','write','execute'], vpc: ['read','write','execute'], s3: ['read','write','execute'], cf: ['read','write','execute'], ecs: ['read','write','execute'] } : (user.permissions || {})
  });
});

// 5. Verification Endpoint
app.get('/api/auth/verify', (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.send(renderVerificationHtml(false, 'Token is missing.'));
  }

  const users = readUsersDB();
  const userIndex = users.findIndex(u => u.verificationToken === token);

  if (userIndex === -1) {
    return res.send(renderVerificationHtml(false, 'Invalid or expired verification token.'));
  }

  users[userIndex].isVerified = true;
  delete users[userIndex].verificationToken; // remove token once verified

  writeUsersDB(users);

  res.send(renderVerificationHtml(true, 'Your email has been successfully verified! You can now log in to the portal.'));
});

// === USER MANAGEMENT ENDPOINTS (ADMIN ONLY) ===

// Middleware to require Admin privileges
function requireAdmin(req, res, next) {
  const users = readUsersDB();
  const user = users.find(u => u.email.toLowerCase() === req.userEmail.toLowerCase());
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden. Admin privileges required.' });
  }
  next();
}

// Middleware to require a specific service permission
// perm: 'read' | 'write' | 'execute'
function requirePermission(service, perm) {
  return (req, res, next) => {
    const users = readUsersDB();
    const user = users.find(u => u.email.toLowerCase() === req.userEmail.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });
    // Admins have all permissions
    if (user.isAdmin) return next();
    const perms = (user.permissions || {})[service] || [];
    if (!perms.includes(perm)) {
      return res.status(403).json({ error: `You do not have ${perm} permission for ${service.toUpperCase()}.` });
    }
    next();
  };
}

// 1. Get all users
app.get('/api/users', requireAdmin, (req, res) => {
  const users = readUsersDB();
  const sanitizedUsers = users.map(u => ({
    name: u.name,
    email: u.email,
    isAdmin: !!u.isAdmin,
    isVerified: !!u.isVerified,
    permissions: u.permissions || {},
    createdAt: u.createdAt
  }));
  res.json(sanitizedUsers);
});

// 2. Update user status (verify / toggle admin)
app.put('/api/users/update', requireAdmin, (req, res) => {
  const targetEmail = (req.query.email || '').toLowerCase().trim();
  const { isVerified, isAdmin, permissions } = req.body;

  if (!targetEmail) {
    return res.status(400).json({ error: 'Email query parameter is required.' });
  }

  if (targetEmail === req.userEmail.toLowerCase().trim()) {
    if (isAdmin === false) {
      return res.status(400).json({ error: 'You cannot demote yourself from Admin status.' });
    }
  }

  if (targetEmail === 'joy.debnath@webskitters.com') {
    if (isAdmin === false) {
      return res.status(400).json({ error: 'The primary admin user Joy Debnath cannot be demoted from Admin status.' });
    }
  }

  const users = readUsersDB();
  const userIndex = users.findIndex(u => u.email.toLowerCase() === targetEmail);

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (isVerified !== undefined) {
    users[userIndex].isVerified = !!isVerified;
  }
  if (isAdmin !== undefined) {
    users[userIndex].isAdmin = !!isAdmin;
    if (!users[userIndex].isAdmin) {
      users[userIndex].permissions = {
        ec2: ['read'],
        vpc: ['read'],
        s3: ['read'],
        cf: ['read'],
        ecs: ['read'],
        billing: ['read']
      };
    } else {
      delete users[userIndex].permissions;
    }
  }

  if (permissions !== undefined && !users[userIndex].isAdmin) {
    const VALID_SERVICES = ['ec2', 'vpc', 's3', 'cf', 'ecs', 'billing'];
    const VALID_PERMS = ['read', 'write', 'execute'];
    const sanitizedPermissions = {};
    if (permissions && typeof permissions === 'object') {
      VALID_SERVICES.forEach(svc => {
        if (Array.isArray(permissions[svc])) {
          sanitizedPermissions[svc] = permissions[svc].filter(p => VALID_PERMS.includes(p));
        } else {
          sanitizedPermissions[svc] = [];
        }
      });
    } else {
      VALID_SERVICES.forEach(svc => { sanitizedPermissions[svc] = []; });
    }
    users[userIndex].permissions = sanitizedPermissions;
  }

  writeUsersDB(users);
  res.json({ message: 'User updated successfully' });
});

// 3. Delete user
app.delete('/api/users/delete', requireAdmin, (req, res) => {
  const targetEmail = (req.query.email || '').toLowerCase().trim();

  if (!targetEmail) {
    return res.status(400).json({ error: 'Email query parameter is required.' });
  }

  if (targetEmail === req.userEmail.toLowerCase().trim()) {
    return res.status(400).json({ error: 'You cannot delete your own admin account.' });
  }

  if (targetEmail === 'joy.debnath@webskitters.com') {
    return res.status(400).json({ error: 'The primary admin account Joy Debnath cannot be deleted.' });
  }

  const users = readUsersDB();
  const filteredUsers = users.filter(u => u.email.toLowerCase() !== targetEmail);

  if (users.length === filteredUsers.length) {
    return res.status(404).json({ error: 'User not found.' });
  }

  writeUsersDB(filteredUsers);

  // Clear active sessions for this user to force immediate logout
  const sessions = readSessionsDB();
  const filteredSessions = sessions.filter(s => s.email.toLowerCase() !== targetEmail);
  writeSessionsDB(filteredSessions);

  res.json({ message: 'User deleted successfully' });
});

// 4. Change Password
app.post('/api/users/change-password', (req, res) => {
  const requesterEmail = req.userEmail.toLowerCase().trim();
  const targetEmail = (req.body.email || '').toLowerCase().trim();
  const newPassword = (req.body.newPassword || '').trim();

  if (!targetEmail || !newPassword) {
    return res.status(400).json({ error: 'Email and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const users = readUsersDB();
  const requester = users.find(u => u.email.toLowerCase() === requesterEmail);
  if (!requester) return res.status(401).json({ error: 'Unauthorized.' });

  // Non-admin can only target their own email
  if (!requester.isAdmin) {
    if (requesterEmail !== targetEmail) {
      return res.status(403).json({ error: 'You can only change your own password.' });
    }
  }

  const targetIndex = users.findIndex(u => u.email.toLowerCase() === targetEmail);
  if (targetIndex === -1) return res.status(404).json({ error: 'User not found.' });

  const targetUser = users[targetIndex];

  // Extra safety: non-admin cannot change an admin account's password
  if (!requester.isAdmin && targetUser.isAdmin) {
    return res.status(403).json({ error: 'You do not have permission to change an admin password.' });
  }

  // Hash and update
  const salt = generateSalt();
  const passwordHash = hashPassword(newPassword, salt);
  users[targetIndex].salt = salt;
  users[targetIndex].passwordHash = passwordHash;
  writeUsersDB(users);

  res.json({ message: `Password updated successfully for ${targetUser.name}.` });
});

// 5. Admin Create User
app.post('/api/users/create', requireAdmin, (req, res) => {
  const { name, email, password, isAdmin: makeAdmin, isVerified: setVerified, permissions } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const users = readUsersDB();
  const lowerEmail = email.toLowerCase().trim();

  if (users.find(u => u.email.toLowerCase() === lowerEmail)) {
    return res.status(400).json({ error: 'Email is already registered.' });
  }

  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);

  // Sanitize permissions: only allow valid services/levels
  const VALID_SERVICES = ['ec2', 'vpc', 's3', 'cf', 'ecs', 'billing'];
  const VALID_PERMS = ['read', 'write', 'execute'];
  const sanitizedPermissions = {};
  if (permissions && typeof permissions === 'object') {
    VALID_SERVICES.forEach(svc => {
      if (Array.isArray(permissions[svc])) {
        sanitizedPermissions[svc] = permissions[svc].filter(p => VALID_PERMS.includes(p));
      } else {
        sanitizedPermissions[svc] = [];
      }
    });
  } else {
    VALID_SERVICES.forEach(svc => { sanitizedPermissions[svc] = []; });
  }

  const newUser = {
    name: name.trim(),
    email: lowerEmail,
    salt,
    passwordHash,
    isVerified: setVerified !== false,
    isAdmin: !!makeAdmin,
    permissions: !!makeAdmin ? undefined : sanitizedPermissions,
    createdAt: new Date().toISOString()
  };

  // Clean up undefined fields
  if (newUser.permissions === undefined) delete newUser.permissions;

  users.push(newUser);
  writeUsersDB(users);

  res.json({
    message: `User ${newUser.name} (${newUser.email}) created successfully.`,
    user: {
      name: newUser.name,
      email: newUser.email,
      isAdmin: newUser.isAdmin,
      isVerified: newUser.isVerified,
      permissions: newUser.permissions || {}
    }
  });
});

// Helper to read DB
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

// Helper to write DB
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// AWS Profile Helper functions
function getAwsCredentialsPath() {
  if (process.platform === 'linux') {
    return '/home/ubuntu/.aws/credentials';
  }
  return path.join(os.homedir(), '.aws', 'credentials');
}

function parseAwsCredentialsFile(content) {
  const lines = content.split(/\r?\n/);
  const profiles = {};
  let currentProfile = null;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentProfile = trimmed.slice(1, -1).trim();
      profiles[currentProfile] = {};
    } else if (currentProfile && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith(';')) {
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        profiles[currentProfile][key] = val;
      }
    }
  });

  return profiles;
}

function serializeAwsCredentials(profiles) {
  let content = '';
  for (const [profileName, keys] of Object.entries(profiles)) {
    content += `[${profileName}]\n`;
    for (const [key, val] of Object.entries(keys)) {
      content += `${key} = ${val}\n`;
    }
    content += '\n';
  }
  return content;
}

// Keep track of active log streams (clients listening to SSE)
const clients = {};
const logHistory = {};

// Broadcast helper for SSE
function sendLog(name, message) {
  if (!logHistory[name]) {
    logHistory[name] = [];
  }
  logHistory[name].push(message);

  if (clients[name]) {
    clients[name].forEach(res => {
      res.write(`data: ${JSON.stringify({ text: message })}\n\n`);
    });
  }
}

// Simplified Terraform template
const TERRAFORM_TEMPLATE = `
terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "key_name" {
  type    = string
}

variable "instance_name" {
  type    = string
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "ami_id" {
  type    = string
}

variable "user_data" {
  type    = string
  default = ""
}

variable "volume_size" {
  type    = number
  default = 30
}

variable "ingress_rules" {
  type = list(object({
    from_port   = number
    to_port     = number
    protocol    = string
    cidr_blocks = list(string)
  }))
}

variable "vpc_id" {
  type    = string
  default = ""
}

variable "subnet_id" {
  type    = string
  default = ""
}

variable "associate_eip" {
  type    = bool
  default = false
}

variable "instance_count" {
  type    = number
  default = 1
}

resource "tls_private_key" "key" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "key" {
  key_name   = var.key_name
  public_key = tls_private_key.key.public_key_openssh
}

resource "aws_security_group" "sg" {
  name        = "\${var.instance_name}-sg"
  description = "Security group for \${var.instance_name}"
  vpc_id      = var.vpc_id != "" ? var.vpc_id : null

  dynamic "ingress" {
    for_each = var.ingress_rules
    content {
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "\${var.instance_name}-sg"
  }
}

resource "aws_instance" "instance" {
  count                  = var.instance_count
  ami                    = var.ami_id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.key.key_name
  vpc_security_group_ids = [aws_security_group.sg.id]
  subnet_id              = var.subnet_id != "" ? var.subnet_id : null
  user_data_base64       = var.user_data != "" ? base64encode(var.user_data) : null

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.volume_size
    encrypted             = true
    delete_on_termination = true
  }

  tags = {
    Name = var.instance_count > 1 ? "\${var.instance_name}-\${count.index + 1}" : var.instance_name
  }
}

resource "aws_eip" "eip" {
  count    = var.associate_eip ? var.instance_count : 0
  instance = aws_instance.instance[count.index].id
  domain   = "vpc"

  tags = {
    Name = var.instance_count > 1 ? "\${var.instance_name}-eip-\${count.index + 1}" : "\${var.instance_name}-eip"
  }
}

output "public_ip" {
  value = var.associate_eip ? join(", ", aws_eip.eip[*].public_ip) : join(", ", aws_instance.instance[*].public_ip)
}

output "instance_id" {
  value = join(", ", aws_instance.instance[*].id)
}

output "private_key_pem" {
  value     = tls_private_key.key.private_key_pem
  sensitive = true
}
`;

// VPC Terraform Template
const VPC_TERRAFORM_TEMPLATE = `
terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "vpc_name" {
  type = string
}

variable "cidr_block" {
  type    = string
  default = "10.0.0.0/16"
}

variable "public_subnet_count" {
  type    = number
  default = 2
}

variable "private_subnet_count" {
  type    = number
  default = 2
}

variable "enable_igw" {
  type    = bool
  default = true
}

variable "enable_nat" {
  type    = bool
  default = false
}

variable "enable_dns_hostnames" {
  type    = bool
  default = true
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.cidr_block
  enable_dns_hostnames = var.enable_dns_hostnames
  enable_dns_support   = true

  tags = {
    Name = var.vpc_name
  }
}

resource "aws_subnet" "public" {
  count                   = var.public_subnet_count
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.cidr_block, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index % length(data.aws_availability_zones.available.names)]
  map_public_ip_on_launch = true

  tags = {
    Name = "\${var.vpc_name}-public-\${count.index + 1}"
    Type = "public"
  }
}

resource "aws_subnet" "private" {
  count             = var.private_subnet_count
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.cidr_block, 8, count.index + var.public_subnet_count)
  availability_zone = data.aws_availability_zones.available.names[count.index % length(data.aws_availability_zones.available.names)]

  tags = {
    Name = "\${var.vpc_name}-private-\${count.index + 1}"
    Type = "private"
  }
}

resource "aws_internet_gateway" "igw" {
  count  = var.enable_igw ? 1 : 0
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "\${var.vpc_name}-igw"
  }
}

resource "aws_route_table" "public" {
  count  = var.enable_igw && var.public_subnet_count > 0 ? 1 : 0
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw[0].id
  }

  tags = {
    Name = "\${var.vpc_name}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = var.enable_igw && var.public_subnet_count > 0 ? var.public_subnet_count : 0
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

resource "aws_eip" "nat" {
  count  = var.enable_nat && var.public_subnet_count > 0 ? 1 : 0
  domain = "vpc"
}

resource "aws_nat_gateway" "nat" {
  count         = var.enable_nat && var.public_subnet_count > 0 ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "\${var.vpc_name}-nat"
  }

  depends_on = [aws_internet_gateway.igw]
}

resource "aws_route_table" "private" {
  count  = var.enable_nat && var.private_subnet_count > 0 ? 1 : 0
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat[0].id
  }

  tags = {
    Name = "\${var.vpc_name}-private-rt"
  }
}

resource "aws_route_table_association" "private" {
  count          = var.enable_nat && var.private_subnet_count > 0 ? var.private_subnet_count : 0
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[0].id
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}
`;

// S3 Terraform Template
const S3_TERRAFORM_TEMPLATE = `
terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "bucket_name" {
  type = string
}

variable "versioning_enabled" {
  type    = bool
  default = false
}

variable "block_public_access" {
  type    = bool
  default = true
}

variable "encryption_algorithm" {
  type    = string
  default = "AES256"
}

variable "force_destroy" {
  type    = bool
  default = false
}

variable "bucket_namespace" {
  type    = string
  default = "global"
}

resource "aws_s3_bucket" "bucket" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy

  tags = {
    Name = var.bucket_name
  }
}

resource "aws_s3_bucket_versioning" "versioning" {
  bucket = aws_s3_bucket.bucket.id

  versioning_configuration {
    status = var.versioning_enabled ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_public_access_block" "pab" {
  bucket                  = aws_s3_bucket.bucket.id
  block_public_acls       = var.block_public_access
  block_public_policy     = var.block_public_access
  ignore_public_acls      = var.block_public_access
  restrict_public_buckets = var.block_public_access
}

resource "aws_s3_bucket_server_side_encryption_configuration" "sse" {
  bucket = aws_s3_bucket.bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = var.encryption_algorithm
    }
  }
}

output "bucket_id" {
  value = aws_s3_bucket.bucket.id
}

output "bucket_arn" {
  value = aws_s3_bucket.bucket.arn
}

output "bucket_domain_name" {
  value = aws_s3_bucket.bucket.bucket_domain_name
}
`;

// API Routes

// 0. Get and Add AWS profiles
app.get('/api/aws-profiles', (req, res) => {
  const credPath = getAwsCredentialsPath();
  if (!fs.existsSync(credPath)) {
    return res.json([]);
  }
  try {
    const content = fs.readFileSync(credPath, 'utf8');
    const profiles = parseAwsCredentialsFile(content);
    res.json(Object.keys(profiles));
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse AWS profiles: ' + err.message });
  }
});

app.post('/api/aws-profiles', (req, res) => {
  const { profileName, accessKeyId, secretAccessKey } = req.body;
  if (!profileName || !accessKeyId || !secretAccessKey) {
    return res.status(400).json({ error: 'Missing profileName, accessKeyId, or secretAccessKey' });
  }

  if (!/^[a-zA-Z0-9-]+$/.test(profileName)) {
    return res.status(400).json({ error: 'Profile name must be alphanumeric and dashes only' });
  }

  const credPath = getAwsCredentialsPath();
  const awsDir = path.dirname(credPath);

  try {
    if (!fs.existsSync(awsDir)) {
      fs.mkdirSync(awsDir, { recursive: true });
    }

    let content = '';
    if (fs.existsSync(credPath)) {
      content = fs.readFileSync(credPath, 'utf8');
    }

    const profiles = parseAwsCredentialsFile(content);
    profiles[profileName] = {
      aws_access_key_id: accessKeyId.trim(),
      aws_secret_access_key: secretAccessKey.trim()
    };

    const newContent = serializeAwsCredentials(profiles);
    fs.writeFileSync(credPath, newContent, 'utf8');
    fs.chmodSync(credPath, 0o600);

    res.json({ success: true, profiles: Object.keys(profiles) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save AWS profile: ' + err.message });
  }
});

// 1. Get all deployments
app.get('/api/deployments', requirePermission('ec2','read'), (req, res) => {
  res.json(readDB());
});

// 2. Stream logs via Server-Sent Events (SSE)
app.get('/api/stream-logs', (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).send('Name parameter is required');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Stream historical logs first
  if (logHistory[name]) {
    logHistory[name].forEach(msg => {
      res.write(`data: ${JSON.stringify({ text: msg })}\n\n`);
    });
  }

  if (!clients[name]) {
    clients[name] = [];
  }
  clients[name].push(res);

  req.on('close', () => {
    clients[name] = clients[name].filter(client => client !== res);
    if (clients[name].length === 0) {
      delete clients[name];
    }
  });
});

// 2.5 Preview deployment configuration
app.post('/api/preview', requirePermission('ec2','write'), (req, res) => {
  const { name, region, instanceType, amiId, volumeSize, userData, vpcId, subnetId, associateEip, keyName, instanceCount } = req.body;

  if (!name || !region || !instanceType || !amiId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // Validate name (alphanumeric and dashes only)
  if (!/^[a-zA-Z0-9-]+$/.test(name)) {
    return res.status(400).json({ error: 'Name must be alphanumeric and dashes only' });
  }

  if (keyName && !/^[a-zA-Z0-9_-]+$/.test(keyName)) {
    return res.status(400).json({ error: 'Key name must be alphanumeric, underscores, and dashes only' });
  }

  // Parse ingressRules from request body
  let parsedRules = [];
  if (Array.isArray(req.body.ingressRules)) {
    parsedRules = req.body.ingressRules.map(r => {
      let from_port = 22;
      let to_port = 22;
      let protocol = 'tcp';
      
      if (r.port) {
        if (typeof r.port === 'number') {
          from_port = r.port;
          to_port = r.port;
        } else if (typeof r.port === 'string') {
          const range = r.port.split('-');
          if (range.length === 2) {
            from_port = parseInt(range[0], 10);
            to_port = parseInt(range[1], 10);
          } else {
            from_port = parseInt(r.port, 10);
            to_port = parseInt(r.port, 10);
          }
        }
      }
      if (r.protocol) {
        protocol = r.protocol.toLowerCase();
      }
      return {
        from_port,
        to_port,
        protocol,
        cidr_blocks: ["0.0.0.0/0"]
      };
    }).filter(r => !isNaN(r.from_port) && !isNaN(r.to_port));
  } else {
    const allowedPortsStr = req.body.ports || '22';
    const allowedPorts = allowedPortsStr.split(',')
      .map(p => parseInt(p.trim(), 10))
      .filter(p => !isNaN(p));
    parsedRules = allowedPorts.map(port => ({
      from_port: port,
      to_port: port,
      protocol: 'tcp',
      cidr_blocks: ["0.0.0.0/0"]
    }));
  }

  // Ensure SSH access (port 22/tcp) is ALWAYS present for access safety
  const sshExists = parsedRules.some(r => r.from_port === 22 && r.to_port === 22 && r.protocol === 'tcp');
  if (!sshExists) {
    parsedRules.unshift({
      from_port: 22,
      to_port: 22,
      protocol: 'tcp',
      cidr_blocks: ["0.0.0.0/0"]
    });
  }

  // Generate tfvars object representation
  const tfVars = {
    aws_region: region,
    instance_name: name,
    instance_type: instanceType,
    ami_id: amiId,
    user_data: (userData || '').replace(/\r\n/g, '\n'),
    volume_size: parseInt(volumeSize, 10) || 30,
    ingress_rules: parsedRules,
    vpc_id: vpcId || '',
    subnet_id: subnetId || '',
    associate_eip: !!associateEip,
    key_name: keyName || `${name}-key`,
    instance_count: parseInt(instanceCount, 10) || 1
  };

  res.json({
    mainTf: TERRAFORM_TEMPLATE,
    tfVarsJson: JSON.stringify(tfVars, null, 2)
  });
});

// 3. Trigger new deployment
app.post('/api/deploy', requirePermission('ec2','write'), (req, res) => {
  const { name, region, instanceType, amiId, volumeSize, awsProfile, userData, vpcId, subnetId, associateEip, keyName, instanceCount } = req.body;

  if (!name || !region || !instanceType || !amiId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // Validate name (alphanumeric and dashes only)
  if (!/^[a-zA-Z0-9-]+$/.test(name)) {
    return res.status(400).json({ error: 'Name must be alphanumeric and dashes only' });
  }

  if (keyName && !/^[a-zA-Z0-9_-]+$/.test(keyName)) {
    return res.status(400).json({ error: 'Key name must be alphanumeric, underscores, and dashes only' });
  }

  const finalKeyName = keyName || `${name}-key`;

  // Parse ingressRules from request body
  let parsedRules = [];
  if (Array.isArray(req.body.ingressRules)) {
    parsedRules = req.body.ingressRules.map(r => {
      let from_port = 22;
      let to_port = 22;
      let protocol = 'tcp';
      
      if (r.port) {
        if (typeof r.port === 'number') {
          from_port = r.port;
          to_port = r.port;
        } else if (typeof r.port === 'string') {
          const range = r.port.split('-');
          if (range.length === 2) {
            from_port = parseInt(range[0], 10);
            to_port = parseInt(range[1], 10);
          } else {
            from_port = parseInt(r.port, 10);
            to_port = parseInt(r.port, 10);
          }
        }
      }
      if (r.protocol) {
        protocol = r.protocol.toLowerCase();
      }
      return {
        from_port,
        to_port,
        protocol,
        cidr_blocks: ["0.0.0.0/0"]
      };
    }).filter(r => !isNaN(r.from_port) && !isNaN(r.to_port));
  } else {
    const allowedPortsStr = req.body.ports || '22';
    const allowedPorts = allowedPortsStr.split(',')
      .map(p => parseInt(p.trim(), 10))
      .filter(p => !isNaN(p));
    parsedRules = allowedPorts.map(port => ({
      from_port: port,
      to_port: port,
      protocol: 'tcp',
      cidr_blocks: ["0.0.0.0/0"]
    }));
  }

  // Ensure SSH access (port 22/tcp) is ALWAYS present for access safety
  const sshExists = parsedRules.some(r => r.from_port === 22 && r.to_port === 22 && r.protocol === 'tcp');
  if (!sshExists) {
    parsedRules.unshift({
      from_port: 22,
      to_port: 22,
      protocol: 'tcp',
      cidr_blocks: ["0.0.0.0/0"]
    });
  }

  const friendlyPortsStr = parsedRules.map(r => r.from_port === r.to_port ? `${r.from_port}/${getFriendlyProtocol(r.from_port, r.protocol)}` : `${r.from_port}-${r.to_port}/${r.protocol.toUpperCase()}`).join(', ');

  const db = readDB();
  if (db.find(d => d.name === name)) {
    return res.status(400).json({ error: `Deployment with name "${name}" already exists` });
  }

  const targetDir = path.join(DEPLOYMENTS_DIR, name);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Write main.tf
  fs.writeFileSync(path.join(targetDir, 'main.tf'), TERRAFORM_TEMPLATE);

  // Write tfvars
  const tfVars = {
    aws_region: region,
    instance_name: name,
    instance_type: instanceType,
    ami_id: amiId,
    user_data: (userData || "").replace(/\r\n/g, "\n"),
    volume_size: parseInt(volumeSize, 10) || 30,
    ingress_rules: parsedRules,
    vpc_id: vpcId || '',
    subnet_id: subnetId || '',
    associate_eip: !!associateEip,
    key_name: finalKeyName,
    instance_count: parseInt(instanceCount, 10) || 1
  };
  fs.writeFileSync(path.join(targetDir, 'terraform.tfvars.json'), JSON.stringify(tfVars, null, 2));

  // Add deployment to DB as building
  const newDeployment = {
    name,
    region,
    instanceType,
    amiId,
    volumeSize: tfVars.volume_size,
    ports: friendlyPortsStr,
    vpcId: vpcId || '',
    subnetId: subnetId || '',
    associateEip: !!associateEip,
    keyName: finalKeyName,
    status: 'creating',
    publicIp: 'N/A',
    instanceId: 'N/A',
    awsProfile: awsProfile || 'default',
    createdAt: new Date().toISOString(),
    instanceCount: parseInt(instanceCount, 10) || 1
  };
  db.push(newDeployment);
  writeDB(db);

  logHistory[name] = [];

  res.json({ message: 'Deployment started', name });

  // Asynchronously execute terraform
  const execute = async () => {
    try {
      sendLog(name, `=== Initializing Terraform for ${name} using profile "${awsProfile || 'default'}" ===`);
      await runCmd('terraform', ['init', '-no-color'], targetDir, name, awsProfile);

      sendLog(name, `=== Applying Terraform Plan for ${name} using profile "${awsProfile || 'default'}" ===`);
      await runCmd('terraform', ['apply', '-auto-approve', '-no-color'], targetDir, name, awsProfile);

      sendLog(name, `=== Fetching Terraform Output ===`);
      const outputs = await getOutput(targetDir, awsProfile);

      // Save PEM Key
      const keyPath = path.join(targetDir, `${finalKeyName}.pem`);
      fs.writeFileSync(keyPath, outputs.private_key_pem.value);
      fs.chmodSync(keyPath, 0o400);

      // Update DB
      const currentDB = readDB();
      const match = currentDB.find(d => d.name === name);
      if (match) {
        match.status = 'active';
        match.publicIp = outputs.public_ip.value;
        match.instanceId = outputs.instance_id.value;
        writeDB(currentDB);
      }

      sendLog(name, `=== Successfully Deployed EC2 Server ===`);
      sendLog(name, `Instance ID: ${outputs.instance_id.value}`);
      sendLog(name, `Public IP: ${outputs.public_ip.value}`);
      sendLog(name, `SSH PEM key generated and ready for download.`);
    } catch (err) {
      sendLog(name, `=== DEPLOYMENT FAILED ===\nError: ${err.message}`);
      const currentDB = readDB();
      const match = currentDB.find(d => d.name === name);
      if (match) {
        match.status = 'failed';
        writeDB(currentDB);
      }
    }
  };

  execute();
});

// 4. Destroy deployment
app.post('/api/destroy', requirePermission('ec2', 'execute'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const db = readDB();
  const match = db.find(d => d.name === name);
  if (!match) return res.status(404).json({ error: 'Deployment not found' });

  const awsProfile = match.awsProfile || 'default';
  match.status = 'destroying';
  writeDB(db);

  logHistory[name] = [];

  res.json({ message: 'Destroy started', name });

  const execute = async () => {
    try {
      const targetDir = path.join(DEPLOYMENTS_DIR, name);
      const statePath = path.join(targetDir, 'terraform.tfstate');
      let hasResources = false;
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.resources && state.resources.length > 0) {
            hasResources = true;
          }
        } catch (e) {}
      }

      if (hasResources) {
        if (!fs.existsSync(path.join(targetDir, '.terraform'))) {
          sendLog(name, `=== Initializing Terraform for ${name} using profile "${awsProfile}" ===`);
          await runCmd('terraform', ['init', '-no-color'], targetDir, name, awsProfile);
        }
        sendLog(name, `=== Destroying EC2 Server and Resources for ${name} using profile "${awsProfile}" ===`);
        await runCmd('terraform', ['destroy', '-auto-approve', '-no-color'], targetDir, name, awsProfile);
      } else {
        sendLog(name, `=== No resources found in state for ${name}. Skipping Terraform execution. ===`);
      }

      // Remove directory and clean DB
      sendLog(name, `=== Cleaning Deployment Files ===`);
      safeRmSync(targetDir);

      const currentDB = readDB();
      const filtered = currentDB.filter(d => d.name !== name);
      writeDB(filtered);

      sendLog(name, `=== DESTRUCTION COMPLETE ===`);
    } catch (err) {
      sendLog(name, `=== DESTRUCTION FAILED ===\nError: ${err.message}`);
      const currentDB = readDB();
      const match = currentDB.find(d => d.name === name);
      if (match) {
        match.status = 'destroy-failed';
        writeDB(currentDB);
      }
    }
  };

  execute();
});

// 5. Download Private Key
app.get('/api/download-key/:name', requirePermission('ec2','read'), (req, res) => {
  const { name } = req.params;
  const db = readDB();
  const deployment = db.find(d => d.name === name);
  const keyName = deployment && deployment.keyName ? deployment.keyName : `${name}-key`;

  let keyPath = path.join(DEPLOYMENTS_DIR, name, `${keyName}.pem`);
  let fileName = `${keyName}.pem`;
  if (!fs.existsSync(keyPath)) {
    const legacyPath = path.join(DEPLOYMENTS_DIR, name, `${name}.pem`);
    if (fs.existsSync(legacyPath)) {
      keyPath = legacyPath;
      fileName = `${name}.pem`;
    }
  }

  if (fs.existsSync(keyPath)) {
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.setHeader('Content-Type', 'application/x-pem-file');
    fs.createReadStream(keyPath).pipe(res);
  } else {
    res.status(404).send('Private key not found for this deployment.');
  }
});

// Helper to spawn child processes and pipe output to SSE log stream
function runCmd(cmd, args, cwd, logName, profileName = null) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (profileName) {
      env.AWS_PROFILE = profileName;
    }
    const child = spawn(cmd, args, { cwd, env });

    child.stdout.on('data', data => {
      sendLog(logName, data.toString());
    });

    child.stderr.on('data', data => {
      sendLog(logName, data.toString());
    });

    child.on('error', err => {
      reject(err);
    });

    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command ${cmd} exited with code ${code}`));
      }
    });
  });
}

// Helper to get terraform output
function getOutput(cwd, profileName = null) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (profileName) {
      env.AWS_PROFILE = profileName;
    }
    const child = spawn('terraform', ['output', '-json'], { cwd, env });
    let outputData = '';

    child.stdout.on('data', data => {
      outputData += data.toString();
    });

    child.on('error', err => {
      reject(err);
    });

    child.on('close', code => {
      if (code === 0) {
        try {
          resolve(JSON.parse(outputData));
        } catch (e) {
          reject(new Error('Failed to parse terraform output JSON'));
        }
      } else {
        reject(new Error('Terraform output command failed'));
      }
    });
  });
}

// Billing helper to run command and capture output
function runCliCapture(cmd, args, profileName = null) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (profileName) {
      env.AWS_PROFILE = profileName;
    }
    const child = spawn(cmd, args, { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => { stdout += data.toString(); });
    child.stderr.on('data', data => { stderr += data.toString(); });
    child.on('error', err => reject(err));
    child.on('close', code => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Command exited with code ${code}`));
      }
    });
  });
}


// VPC & S3 DB helpers
function readVpcDB() {
  try { return JSON.parse(fs.readFileSync(VPC_DB_FILE, 'utf8')); } catch (e) { return []; }
}
function writeVpcDB(data) { fs.writeFileSync(VPC_DB_FILE, JSON.stringify(data, null, 2)); }
function readS3DB() {
  try { return JSON.parse(fs.readFileSync(S3_DB_FILE, 'utf8')); } catch (e) { return []; }
}
function writeS3DB(data) { fs.writeFileSync(S3_DB_FILE, JSON.stringify(data, null, 2)); }

// === VPC ROUTES ===

app.get('/api/vpcs', requirePermission('vpc','read'), (req, res) => {
  res.json(readVpcDB());
});

app.post('/api/vpc/preview', requirePermission('vpc','write'), (req, res) => {
  const { vpcName, region, cidrBlock, publicSubnetCount, privateSubnetCount, enableIgw, enableNat, enableDnsHostnames } = req.body;
  if (!vpcName || !region || !cidrBlock) return res.status(400).json({ error: 'Missing required parameters' });
  if (!/^[a-zA-Z0-9-]+$/.test(vpcName)) return res.status(400).json({ error: 'VPC name must be alphanumeric and dashes only' });
  const tfVars = {
    aws_region: region,
    vpc_name: vpcName,
    cidr_block: cidrBlock,
    public_subnet_count: parseInt(publicSubnetCount, 10) || 0,
    private_subnet_count: parseInt(privateSubnetCount, 10) || 0,
    enable_igw: !!enableIgw,
    enable_nat: !!enableNat,
    enable_dns_hostnames: enableDnsHostnames !== false
  };
  res.json({ mainTf: VPC_TERRAFORM_TEMPLATE, tfVarsJson: JSON.stringify(tfVars, null, 2) });
});

app.post('/api/vpc/create', requirePermission('vpc','write'), (req, res) => {
  const { vpcName, region, cidrBlock, publicSubnetCount, privateSubnetCount, enableIgw, enableNat, enableDnsHostnames, awsProfile } = req.body;
  if (!vpcName || !region || !cidrBlock) return res.status(400).json({ error: 'Missing required parameters' });
  if (!/^[a-zA-Z0-9-]+$/.test(vpcName)) return res.status(400).json({ error: 'VPC name must be alphanumeric and dashes only' });
  const db = readVpcDB();
  if (db.find(v => v.name === vpcName)) return res.status(400).json({ error: `VPC "${vpcName}" already exists` });

  const targetDir = path.join(VPC_DEPLOYMENTS_DIR, vpcName);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'main.tf'), VPC_TERRAFORM_TEMPLATE);
  const tfVars = {
    aws_region: region,
    vpc_name: vpcName,
    cidr_block: cidrBlock,
    public_subnet_count: parseInt(publicSubnetCount, 10) || 0,
    private_subnet_count: parseInt(privateSubnetCount, 10) || 0,
    enable_igw: !!enableIgw,
    enable_nat: !!enableNat,
    enable_dns_hostnames: enableDnsHostnames !== false
  };
  fs.writeFileSync(path.join(targetDir, 'terraform.tfvars.json'), JSON.stringify(tfVars, null, 2));
  const newVpc = { name: vpcName, region, cidrBlock, publicSubnetCount: tfVars.public_subnet_count, privateSubnetCount: tfVars.private_subnet_count, enableIgw: tfVars.enable_igw, enableNat: tfVars.enable_nat, awsProfile: awsProfile || 'default', status: 'creating', vpcId: 'N/A', publicSubnetIds: [], privateSubnetIds: [], createdAt: new Date().toISOString() };
  db.push(newVpc);
  writeVpcDB(db);
  logHistory[vpcName] = [];
  res.json({ message: 'VPC creation started', name: vpcName });

  const execute = async () => {
    try {
      sendLog(vpcName, `=== Initializing Terraform for VPC "${vpcName}" using profile "${awsProfile || 'default'}" ===`);
      await runCmd('terraform', ['init', '-no-color'], targetDir, vpcName, awsProfile);
      sendLog(vpcName, `=== Applying VPC Terraform Plan for "${vpcName}" ===`);
      await runCmd('terraform', ['apply', '-auto-approve', '-no-color'], targetDir, vpcName, awsProfile);
      sendLog(vpcName, `=== Fetching VPC Outputs ===`);
      const outputs = await getOutput(targetDir, awsProfile);
      const currentDB = readVpcDB();
      const match = currentDB.find(v => v.name === vpcName);
      if (match) {
        match.status = 'active';
        match.vpcId = outputs.vpc_id ? outputs.vpc_id.value : 'N/A';
        match.publicSubnetIds = outputs.public_subnet_ids ? outputs.public_subnet_ids.value : [];
        match.privateSubnetIds = outputs.private_subnet_ids ? outputs.private_subnet_ids.value : [];
        writeVpcDB(currentDB);
      }
      sendLog(vpcName, `=== VPC Successfully Created ===`);
      sendLog(vpcName, `VPC ID: ${outputs.vpc_id ? outputs.vpc_id.value : 'N/A'}`);
    } catch (err) {
      sendLog(vpcName, `=== VPC CREATION FAILED ===\nError: ${err.message}`);
      const currentDB = readVpcDB();
      const match = currentDB.find(v => v.name === vpcName);
      if (match) { match.status = 'failed'; writeVpcDB(currentDB); }
    }
  };
  execute();
});

app.post('/api/vpc/destroy', requirePermission('vpc','execute'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const db = readVpcDB();
  const match = db.find(v => v.name === name);
  if (!match) return res.status(404).json({ error: 'VPC not found' });
  const awsProfile = match.awsProfile || 'default';
  match.status = 'destroying';
  writeVpcDB(db);
  logHistory[name] = [];
  res.json({ message: 'VPC destroy started', name });
  const execute = async () => {
    try {
      const targetDir = path.join(VPC_DEPLOYMENTS_DIR, name);
      const statePath = path.join(targetDir, 'terraform.tfstate');
      let hasResources = false;
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.resources && state.resources.length > 0) {
            hasResources = true;
          }
        } catch (e) {}
      }

      if (hasResources) {
        if (!fs.existsSync(path.join(targetDir, '.terraform'))) {
          sendLog(name, `=== Initializing Terraform for VPC "${name}" using profile "${awsProfile}" ===`);
          await runCmd('terraform', ['init', '-no-color'], targetDir, name, awsProfile);
        }
        sendLog(name, `=== Destroying VPC "${name}" using profile "${awsProfile}" ===`);
        await runCmd('terraform', ['destroy', '-auto-approve', '-no-color'], targetDir, name, awsProfile);
      } else {
        sendLog(name, `=== No resources found in state for VPC "${name}". Skipping Terraform execution. ===`);
      }
      safeRmSync(targetDir);
      writeVpcDB(readVpcDB().filter(v => v.name !== name));
      sendLog(name, `=== VPC DESTRUCTION COMPLETE ===`);
    } catch (err) {
      sendLog(name, `=== VPC DESTRUCTION FAILED ===\nError: ${err.message}`);
      const currentDB = readVpcDB();
      const m = currentDB.find(v => v.name === name);
      if (m) { m.status = 'destroy-failed'; writeVpcDB(currentDB); }
    }
  };
  execute();
});

// === S3 ROUTES ===

app.get('/api/s3-buckets', requirePermission('s3','read'), (req, res) => {
  res.json(readS3DB());
});

app.post('/api/s3/preview', requirePermission('s3','write'), (req, res) => {
  const { bucketName, region, versioningEnabled, blockPublicAccess, encryptionAlgorithm, forceDestroy, bucketNamespace } = req.body;
  if (!bucketName || !region) return res.status(400).json({ error: 'Missing required parameters' });
  if (!/^[a-z0-9-]+$/.test(bucketName)) return res.status(400).json({ error: 'Bucket name must be lowercase alphanumeric and dashes only' });
  const tfVars = {
    aws_region: region,
    bucket_name: bucketName,
    versioning_enabled: !!versioningEnabled,
    block_public_access: blockPublicAccess !== false,
    encryption_algorithm: encryptionAlgorithm || 'AES256',
    force_destroy: !!forceDestroy,
    bucket_namespace: bucketNamespace || 'global'
  };
  let mainTf = S3_TERRAFORM_TEMPLATE;
  if (bucketNamespace === 'account-regional') {
    mainTf = mainTf.replace('version = "~> 5.0"', 'version = "~> 6.37"')
                  .replace('bucket        = var.bucket_name', 'bucket        = var.bucket_name\n  bucket_namespace = var.bucket_namespace');
  }
  res.json({ mainTf, tfVarsJson: JSON.stringify(tfVars, null, 2) });
});

app.post('/api/s3/create', requirePermission('s3','write'), (req, res) => {
  const { bucketName, region, versioningEnabled, blockPublicAccess, encryptionAlgorithm, forceDestroy, awsProfile, bucketNamespace } = req.body;
  if (!bucketName || !region) return res.status(400).json({ error: 'Missing required parameters' });
  if (!/^[a-z0-9-]+$/.test(bucketName)) return res.status(400).json({ error: 'Bucket name must be lowercase alphanumeric and dashes only' });
  const db = readS3DB();
  if (db.find(b => b.name === bucketName)) return res.status(400).json({ error: `Bucket "${bucketName}" already exists in records` });

  const targetDir = path.join(S3_DEPLOYMENTS_DIR, bucketName);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  
  let mainTf = S3_TERRAFORM_TEMPLATE;
  if (bucketNamespace === 'account-regional') {
    mainTf = mainTf.replace('version = "~> 5.0"', 'version = "~> 6.37"')
                  .replace('bucket        = var.bucket_name', 'bucket        = var.bucket_name\n  bucket_namespace = var.bucket_namespace');
  }
  fs.writeFileSync(path.join(targetDir, 'main.tf'), mainTf);
  
  const tfVars = {
    aws_region: region,
    bucket_name: bucketName,
    versioning_enabled: !!versioningEnabled,
    block_public_access: blockPublicAccess !== false,
    encryption_algorithm: encryptionAlgorithm || 'AES256',
    force_destroy: !!forceDestroy,
    bucket_namespace: bucketNamespace || 'global'
  };
  fs.writeFileSync(path.join(targetDir, 'terraform.tfvars.json'), JSON.stringify(tfVars, null, 2));
  const newBucket = { name: bucketName, region, versioningEnabled: tfVars.versioning_enabled, blockPublicAccess: tfVars.block_public_access, encryptionAlgorithm: tfVars.encryption_algorithm, forceDestroy: tfVars.force_destroy, bucketNamespace: tfVars.bucket_namespace, awsProfile: awsProfile || 'default', status: 'creating', bucketArn: 'N/A', bucketDomain: 'N/A', createdAt: new Date().toISOString() };
  db.push(newBucket);
  writeS3DB(db);
  logHistory[bucketName] = [];
  res.json({ message: 'S3 bucket creation started', name: bucketName });

  const execute = async () => {
    try {
      sendLog(bucketName, `=== Initializing Terraform for S3 bucket "${bucketName}" using profile "${awsProfile || 'default'}" ===`);
      await runCmd('terraform', ['init', '-no-color'], targetDir, bucketName, awsProfile);
      sendLog(bucketName, `=== Applying S3 Terraform Plan for "${bucketName}" ===`);
      await runCmd('terraform', ['apply', '-auto-approve', '-no-color'], targetDir, bucketName, awsProfile);
      sendLog(bucketName, `=== Fetching S3 Outputs ===`);
      const outputs = await getOutput(targetDir, awsProfile);
      const currentDB = readS3DB();
      const match = currentDB.find(b => b.name === bucketName);
      if (match) {
        match.status = 'active';
        match.bucketArn = outputs.bucket_arn ? outputs.bucket_arn.value : 'N/A';
        match.bucketDomain = outputs.bucket_domain_name ? outputs.bucket_domain_name.value : 'N/A';
        writeS3DB(currentDB);
      }
      sendLog(bucketName, `=== S3 Bucket Successfully Created ===`);
      sendLog(bucketName, `Bucket ARN: ${outputs.bucket_arn ? outputs.bucket_arn.value : 'N/A'}`);
    } catch (err) {
      sendLog(bucketName, `=== S3 CREATION FAILED ===\nError: ${err.message}`);
      const currentDB = readS3DB();
      const match = currentDB.find(b => b.name === bucketName);
      if (match) { match.status = 'failed'; writeS3DB(currentDB); }
    }
  };
  execute();
});

app.post('/api/s3/destroy', requirePermission('s3','execute'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const db = readS3DB();
  const match = db.find(b => b.name === name);
  if (!match) return res.status(404).json({ error: 'S3 bucket not found' });
  const awsProfile = match.awsProfile || 'default';
  match.status = 'destroying';
  writeS3DB(db);
  logHistory[name] = [];
  res.json({ message: 'S3 bucket destroy started', name });
  const execute = async () => {
    try {
      const targetDir = path.join(S3_DEPLOYMENTS_DIR, name);
      const statePath = path.join(targetDir, 'terraform.tfstate');
      let hasResources = false;
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.resources && state.resources.length > 0) {
            hasResources = true;
          }
        } catch (e) {}
      }

      if (hasResources) {
        if (!fs.existsSync(path.join(targetDir, '.terraform'))) {
          sendLog(name, `=== Initializing Terraform for S3 bucket "${name}" using profile "${awsProfile}" ===`);
          await runCmd('terraform', ['init', '-no-color'], targetDir, name, awsProfile);
        }
        sendLog(name, `=== Destroying S3 bucket "${name}" using profile "${awsProfile}" ===`);
        await runCmd('terraform', ['destroy', '-auto-approve', '-no-color'], targetDir, name, awsProfile);
      } else {
        sendLog(name, `=== No resources found in state for S3 bucket "${name}". Skipping Terraform execution. ===`);
      }
      safeRmSync(targetDir);
      writeS3DB(readS3DB().filter(b => b.name !== name));
      sendLog(name, `=== S3 BUCKET DESTRUCTION COMPLETE ===`);
    } catch (err) {
      sendLog(name, `=== S3 DESTRUCTION FAILED ===\nError: ${err.message}`);
      const currentDB = readS3DB();
      const m = currentDB.find(b => b.name === name);
      if (m) { m.status = 'destroy-failed'; writeS3DB(currentDB); }
    }
  };
  execute();
});

function generateMockBillingData(startDate, endDate) {
  const mockServices = [
    'Amazon Elastic Compute Cloud',
    'Amazon Simple Storage Service',
    'Amazon Virtual Private Cloud',
    'Amazon CloudFront',
    'Amazon Elastic Container Service',
    'Tax'
  ];
  const months = [];
  let current = new Date(startDate);
  const end = new Date(endDate);
  while (current < end) {
    months.push(current.toISOString().split('T')[0]);
    current.setMonth(current.getMonth() + 1);
  }
  
  const resultsByTime = months.map(m => {
    const groups = mockServices.map(svc => {
      let amount = 0;
      if (svc === 'Amazon Elastic Compute Cloud') {
        amount = (Math.random() * 20 + 5).toFixed(2);
      } else if (svc === 'Amazon Simple Storage Service') {
        amount = (Math.random() * 2 + 0.1).toFixed(2);
      } else if (svc === 'Amazon Virtual Private Cloud') {
        amount = (Math.random() * 5 + 1).toFixed(2);
      } else if (svc === 'Amazon CloudFront') {
        amount = (Math.random() * 3).toFixed(2);
      } else if (svc === 'Amazon Elastic Container Service') {
        amount = (Math.random() * 10).toFixed(2);
      } else if (svc === 'Tax') {
        amount = (Math.random() * 4 + 0.5).toFixed(2);
      }
      return {
        Keys: [svc],
        Metrics: {
          BlendedCost: {
            Amount: amount,
            Unit: 'USD'
          }
        }
      };
    });
    
    const totalAmount = groups.reduce((sum, g) => sum + parseFloat(g.Metrics.BlendedCost.Amount), 0).toFixed(2);
    
    return {
      TimePeriod: {
        Start: m,
        End: new Date(new Date(m).setMonth(new Date(m).getMonth() + 1)).toISOString().split('T')[0]
      },
      Total: {
        BlendedCost: {
          Amount: totalAmount,
          Unit: 'USD'
        }
      },
      Groups: groups,
      Estimated: false
    };
  });
  
  return {
    GroupDefinitions: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
    ResultsByTime: resultsByTime,
    fallback: true
  };
}

function generateMockDailyBillingData(startDate, endDate) {
  const resultsByTime = [];
  let current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    resultsByTime.push({
      TimePeriod: {
        Start: dateStr,
        End: new Date(new Date(dateStr).getTime() + 86400000).toISOString().split('T')[0]
      },
      Total: {
        BlendedCost: {
          Amount: (Math.random() * 2 + 0.1).toFixed(2),
          Unit: 'USD'
        }
      },
      Estimated: false
    });
    current.setDate(current.getDate() + 1);
  }
  return { ResultsByTime: resultsByTime };
}

// GET /api/billing
app.get('/api/billing', requirePermission('billing', 'read'), async (req, res) => {
  const profile = req.query.profile || 'default';
  
  if (profile === 'default') {
    return res.json({
      GroupDefinitions: [],
      ResultsByTime: [],
      accountId: 'N/A',
      daily: {
        ResultsByTime: []
      }
    });
  }
  
  const today = new Date();
  const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const startOf11MonthsAgo = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  
  const endDate = startOfNextMonth.toISOString().split('T')[0];
  const startDate = startOf11MonthsAgo.toISOString().split('T')[0];
  
  const dailyStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14).toISOString().split('T')[0];
  const dailyEnd = today.toISOString().split('T')[0];
  
  try {
    const args = [
      'ce', 'get-cost-and-usage',
      '--time-period', `Start=${startDate},End=${endDate}`,
      '--granularity', 'MONTHLY',
      '--metrics', 'BlendedCost',
      '--group-by', 'Type=DIMENSION,Key=SERVICE'
    ];
    const output = await runCliCapture('aws', args, profile);
    const parsed = JSON.parse(output);
    
    // Fetch STS Account ID
    let accountId = 'N/A';
    try {
      const stsOutput = await runCliCapture('aws', ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'], profile);
      accountId = stsOutput.trim();
    } catch (e) {
      console.warn(`Could not get caller identity for profile ${profile}:`, e.message);
    }
    parsed.accountId = accountId;

    // Fetch Daily Billing
    try {
      const dailyArgs = [
        'ce', 'get-cost-and-usage',
        '--time-period', `Start=${dailyStart},End=${dailyEnd}`,
        '--granularity', 'DAILY',
        '--metrics', 'BlendedCost'
      ];
      const dailyOutput = await runCliCapture('aws', dailyArgs, profile);
      parsed.daily = JSON.parse(dailyOutput);
    } catch (e) {
      console.warn(`Daily Cost Explorer failed for profile ${profile}:`, e.message);
      parsed.daily = generateMockDailyBillingData(dailyStart, dailyEnd);
    }

    res.json(parsed);
  } catch (err) {
    console.warn(`Cost Explorer failed for profile ${profile}, falling back to mock data:`, err.message);
    const mockData = generateMockBillingData(startDate, endDate);
    mockData.accountId = '672929527806';
    mockData.daily = generateMockDailyBillingData(dailyStart, dailyEnd);
    res.json(mockData);
  }
});

// CloudFront DB helpers
function readCfDB() {
  try { return JSON.parse(fs.readFileSync(CF_DB_FILE, 'utf8')); } catch (e) { return []; }
}
function writeCfDB(data) { fs.writeFileSync(CF_DB_FILE, JSON.stringify(data, null, 2)); }

// CloudFront Terraform Template
const CF_TERRAFORM_TEMPLATE = `
terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "distribution_name" {
  type = string
}

variable "s3_bucket_name" {
  type = string
}

variable "default_root_object" {
  type    = string
  default = "index.html"
}

variable "price_class" {
  type    = string
  default = "PriceClass_100"
}

variable "http_protocol_policy" {
  type    = string
  default = "redirect-to-https"
}

variable "default_ttl" {
  type    = number
  default = 86400
}

variable "min_ttl" {
  type    = number
  default = 0
}

variable "max_ttl" {
  type    = number
  default = 31536000
}

variable "origin_path" {
  type    = string
  default = ""
}

variable "compress" {
  type    = bool
  default = true
}

data "aws_s3_bucket" "bucket" {
  bucket = var.s3_bucket_name
}

resource "aws_cloudfront_origin_access_control" "oac" {
  name                              = "\${var.distribution_name}-oac"
  description                       = "OAC for \${var.distribution_name} CloudFront distribution"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "distribution" {
  enabled             = true
  comment             = var.distribution_name
  default_root_object = var.default_root_object
  price_class         = var.price_class

  origin {
    domain_name              = data.aws_s3_bucket.bucket.bucket_regional_domain_name
    origin_id                = "S3-\${var.s3_bucket_name}"
    origin_path              = var.origin_path != "" ? var.origin_path : null
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-\${var.s3_bucket_name}"
    viewer_protocol_policy = var.http_protocol_policy
    compress               = var.compress

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    default_ttl = var.default_ttl
    min_ttl     = var.min_ttl
    max_ttl     = var.max_ttl
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = {
    Name = var.distribution_name
  }
}

resource "aws_s3_bucket_policy" "cf_policy" {
  bucket = var.s3_bucket_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "\${data.aws_s3_bucket.bucket.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.distribution.arn
          }
        }
      }
    ]
  })
}

output "distribution_id" {
  value = aws_cloudfront_distribution.distribution.id
}

output "distribution_domain_name" {
  value = aws_cloudfront_distribution.distribution.domain_name
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.distribution.arn
}

output "distribution_status" {
  value = aws_cloudfront_distribution.distribution.status
}

output "distribution_url" {
  value = "https://\${aws_cloudfront_distribution.distribution.domain_name}"
}
`;

// === CLOUDFRONT ROUTES ===

app.get('/api/distributions', requirePermission('cf','read'), (req, res) => {
  res.json(readCfDB());
});

// List managed S3 buckets for selection
app.get('/api/s3-bucket-names', requirePermission('cf','read'), (req, res) => {
  const buckets = readS3DB();
  res.json(buckets.map(b => ({ name: b.name, region: b.region, status: b.status })));
});

app.post('/api/cf/preview', requirePermission('cf','write'), (req, res) => {
  const { distributionName, s3BucketName, defaultRootObject, priceClass, httpProtocolPolicy, defaultTtl, minTtl, maxTtl, originPath, compress } = req.body;
  if (!distributionName || !s3BucketName) return res.status(400).json({ error: 'Distribution name and S3 bucket name are required' });
  if (!/^[a-zA-Z0-9-]+$/.test(distributionName)) return res.status(400).json({ error: 'Distribution name must be alphanumeric and dashes only' });
  const tfVars = {
    aws_region: 'us-east-1',
    distribution_name: distributionName,
    s3_bucket_name: s3BucketName,
    default_root_object: defaultRootObject || 'index.html',
    price_class: priceClass || 'PriceClass_100',
    http_protocol_policy: httpProtocolPolicy || 'redirect-to-https',
    default_ttl: parseInt(defaultTtl, 10) || 86400,
    min_ttl: parseInt(minTtl, 10) || 0,
    max_ttl: parseInt(maxTtl, 10) || 31536000,
    origin_path: originPath || '',
    compress: compress !== false
  };
  res.json({ mainTf: CF_TERRAFORM_TEMPLATE, tfVarsJson: JSON.stringify(tfVars, null, 2) });
});

app.post('/api/cf/create', requirePermission('cf','write'), (req, res) => {
  const { distributionName, s3BucketName, awsProfile, defaultRootObject, priceClass, httpProtocolPolicy, defaultTtl, minTtl, maxTtl, originPath, compress } = req.body;
  if (!distributionName || !s3BucketName) return res.status(400).json({ error: 'Distribution name and S3 bucket name are required' });
  if (!/^[a-zA-Z0-9-]+$/.test(distributionName)) return res.status(400).json({ error: 'Distribution name must be alphanumeric and dashes only' });
  const db = readCfDB();
  if (db.find(d => d.name === distributionName)) return res.status(400).json({ error: `Distribution "${distributionName}" already exists` });

  const targetDir = path.join(CF_DEPLOYMENTS_DIR, distributionName);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'main.tf'), CF_TERRAFORM_TEMPLATE);

  const tfVars = {
    aws_region: 'us-east-1',
    distribution_name: distributionName,
    s3_bucket_name: s3BucketName,
    default_root_object: defaultRootObject || 'index.html',
    price_class: priceClass || 'PriceClass_100',
    http_protocol_policy: httpProtocolPolicy || 'redirect-to-https',
    default_ttl: parseInt(defaultTtl, 10) || 86400,
    min_ttl: parseInt(minTtl, 10) || 0,
    max_ttl: parseInt(maxTtl, 10) || 31536000,
    origin_path: originPath || '',
    compress: compress !== false
  };
  fs.writeFileSync(path.join(targetDir, 'terraform.tfvars.json'), JSON.stringify(tfVars, null, 2));

  const newDist = {
    name: distributionName,
    s3BucketName,
    awsProfile: awsProfile || 'default',
    priceClass: tfVars.price_class,
    httpProtocolPolicy: tfVars.http_protocol_policy,
    defaultRootObject: tfVars.default_root_object,
    compress: tfVars.compress,
    status: 'creating',
    distributionId: 'N/A',
    domainName: 'N/A',
    distributionArn: 'N/A',
    distributionUrl: 'N/A',
    createdAt: new Date().toISOString()
  };
  db.push(newDist);
  writeCfDB(db);
  logHistory[distributionName] = [];
  res.json({ message: 'CloudFront distribution creation started', name: distributionName });

  const execute = async () => {
    try {
      sendLog(distributionName, `=== Initializing Terraform for CloudFront distribution "${distributionName}" ===`);
      sendLog(distributionName, `=== S3 Origin: ${s3BucketName} | Profile: ${awsProfile || 'default'} ===`);
      await runCmd('terraform', ['init', '-no-color'], targetDir, distributionName, awsProfile);
      sendLog(distributionName, `=== Applying CloudFront Terraform Plan (this may take 5-15 minutes) ===`);
      await runCmd('terraform', ['apply', '-auto-approve', '-no-color'], targetDir, distributionName, awsProfile);
      sendLog(distributionName, `=== Fetching CloudFront Outputs ===`);
      const outputs = await getOutput(targetDir, awsProfile);
      const currentDB = readCfDB();
      const match = currentDB.find(d => d.name === distributionName);
      if (match) {
        match.status = 'active';
        match.distributionId = outputs.distribution_id ? outputs.distribution_id.value : 'N/A';
        match.domainName = outputs.distribution_domain_name ? outputs.distribution_domain_name.value : 'N/A';
        match.distributionArn = outputs.distribution_arn ? outputs.distribution_arn.value : 'N/A';
        match.distributionUrl = outputs.distribution_url ? outputs.distribution_url.value : 'N/A';
        writeCfDB(currentDB);
      }
      sendLog(distributionName, `=== CloudFront Distribution Successfully Created ===`);
      sendLog(distributionName, `Distribution ID: ${outputs.distribution_id ? outputs.distribution_id.value : 'N/A'}`);
      sendLog(distributionName, `Domain: ${outputs.distribution_domain_name ? outputs.distribution_domain_name.value : 'N/A'}`);
      sendLog(distributionName, `URL: ${outputs.distribution_url ? outputs.distribution_url.value : 'N/A'}`);
    } catch (err) {
      sendLog(distributionName, `=== CLOUDFRONT CREATION FAILED ===\nError: ${err.message}`);
      const currentDB = readCfDB();
      const match = currentDB.find(d => d.name === distributionName);
      if (match) { match.status = 'failed'; writeCfDB(currentDB); }
    }
  };
  execute();
});

app.post('/api/cf/destroy', requirePermission('cf','execute'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const db = readCfDB();
  const match = db.find(d => d.name === name);
  if (!match) return res.status(404).json({ error: 'Distribution not found' });
  const awsProfile = match.awsProfile || 'default';
  match.status = 'destroying';
  writeCfDB(db);
  logHistory[name] = [];
  res.json({ message: 'CloudFront destroy started', name });
  const execute = async () => {
    try {
      const targetDir = path.join(CF_DEPLOYMENTS_DIR, name);
      const statePath = path.join(targetDir, 'terraform.tfstate');
      let hasResources = false;
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.resources && state.resources.length > 0) {
            hasResources = true;
          }
        } catch (e) {}
      }

      if (hasResources) {
        if (!fs.existsSync(path.join(targetDir, '.terraform'))) {
          sendLog(name, `=== Initializing Terraform for CloudFront distribution "${name}" using profile "${awsProfile}" ===`);
          await runCmd('terraform', ['init', '-no-color'], targetDir, name, awsProfile);
        }
        sendLog(name, `=== Destroying CloudFront distribution "${name}" using profile "${awsProfile}" ===`);
        await runCmd('terraform', ['destroy', '-auto-approve', '-no-color'], targetDir, name, awsProfile);
      } else {
        sendLog(name, `=== No resources found in state for CloudFront "${name}". Skipping Terraform execution. ===`);
      }
      safeRmSync(targetDir);
      writeCfDB(readCfDB().filter(d => d.name !== name));
      sendLog(name, `=== CLOUDFRONT DESTRUCTION COMPLETE ===`);
    } catch (err) {
      sendLog(name, `=== CLOUDFRONT DESTRUCTION FAILED ===\nError: ${err.message}`);
      const currentDB = readCfDB();
      const m = currentDB.find(d => d.name === name);
      if (m) { m.status = 'destroy-failed'; writeCfDB(currentDB); }
    }
  };
  execute();
});

// === ECS ROUTES ===

const ECS_TERRAFORM_TEMPLATE = `
terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project_name" {
  type = string
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "app_port" {
  type    = number
  default = 80
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "task_cpu" {
  type    = number
  default = 256
}

variable "task_memory" {
  type    = number
  default = 512
}

variable "s3_bucket_name" {
  type    = string
  default = ""
}

module "ecr" {
  source       = "./modules/ecr"
  project_name = var.project_name
  environment  = var.environment
}

module "ecs" {
  source             = "./modules/ecs"
  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = var.vpc_id
  public_subnet_ids   = var.public_subnet_ids
  private_subnet_ids  = var.private_subnet_ids
  ecr_repo_url       = module.ecr.repository_url
  image_tag          = "latest"
  app_port           = var.app_port
  desired_count      = var.desired_count
  task_cpu           = var.task_cpu
  task_memory        = var.task_memory
  s3_bucket_name     = var.s3_bucket_name != "" ? var.s3_bucket_name : "none-bucket"
}

output "ecr_repository_url" {
  value = module.ecr.repository_url
}

output "ecs_cluster_name" {
  value = module.ecs.cluster_name
}

output "ecs_service_name" {
  value = module.ecs.service_name
}

output "alb_dns_name" {
  value = module.ecs.alb_dns_name
}
`;

app.get('/api/ecs-clusters', requirePermission('ecs', 'read'), (req, res) => {
  res.json(readEcsDB());
});

app.post('/api/ecs/preview', requirePermission('ecs', 'write'), (req, res) => {
  const { ecsName, env, cpu, memory, port, tasks, vpcId, publicSubnets, privateSubnets, s3Bucket } = req.body;
  if (!ecsName || !cpu || !memory || !port || !tasks || !vpcId || !publicSubnets || !privateSubnets) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  if (!/^[a-zA-Z0-9-]+$/.test(ecsName)) {
    return res.status(400).json({ error: 'Cluster/Project name must be alphanumeric and dashes only' });
  }
  // Retrieve region from selected VPC profile
  const vpcDb = readVpcDB();
  const matchedVpc = vpcDb.find(v => v.vpcId === vpcId);
  const region = matchedVpc ? matchedVpc.region : 'us-east-1';

  const tfVars = {
    aws_region: region,
    project_name: ecsName,
    environment: env || 'dev',
    vpc_id: vpcId,
    public_subnet_ids: publicSubnets,
    private_subnet_ids: privateSubnets,
    app_port: parseInt(port, 10),
    desired_count: parseInt(tasks, 10),
    task_cpu: parseInt(cpu, 10),
    task_memory: parseInt(memory, 10),
    s3_bucket_name: s3Bucket || ''
  };

  res.json({
    mainTf: ECS_TERRAFORM_TEMPLATE,
    tfVarsJson: JSON.stringify(tfVars, null, 2)
  });
});

app.post('/api/ecs/create', requirePermission('ecs', 'write'), (req, res) => {
  const { ecsName, env, cpu, memory, port, tasks, vpcId, publicSubnets, privateSubnets, s3Bucket, awsProfile } = req.body;
  if (!ecsName || !cpu || !memory || !port || !tasks || !vpcId || !publicSubnets || !privateSubnets) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  if (!/^[a-zA-Z0-9-]+$/.test(ecsName)) {
    return res.status(400).json({ error: 'Cluster/Project name must be alphanumeric and dashes only' });
  }

  const db = readEcsDB();
  if (db.find(c => c.name === ecsName)) {
    return res.status(400).json({ error: `ECS cluster "${ecsName}" already exists` });
  }

  const vpcDb = readVpcDB();
  const matchedVpc = vpcDb.find(v => v.vpcId === vpcId);
  const region = matchedVpc ? matchedVpc.region : 'us-east-1';

  const targetDir = path.join(ECS_DEPLOYMENTS_DIR, ecsName);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Copy modules folder recursively
  const modulesDir = path.join(targetDir, 'modules');
  if (!fs.existsSync(modulesDir)) {
    fs.mkdirSync(modulesDir, { recursive: true });
  }

  // Write main.tf and terraform.tfvars.json
  fs.writeFileSync(path.join(targetDir, 'main.tf'), ECS_TERRAFORM_TEMPLATE);
  const tfVars = {
    aws_region: region,
    project_name: ecsName,
    environment: env || 'dev',
    vpc_id: vpcId,
    public_subnet_ids: publicSubnets,
    private_subnet_ids: privateSubnets,
    app_port: parseInt(port, 10),
    desired_count: parseInt(tasks, 10),
    task_cpu: parseInt(cpu, 10),
    task_memory: parseInt(memory, 10),
    s3_bucket_name: s3Bucket || ''
  };
  fs.writeFileSync(path.join(targetDir, 'terraform.tfvars.json'), JSON.stringify(tfVars, null, 2));

  // Add ECS deployment to DB
  const newDeployment = {
    name: ecsName,
    region,
    env: env || 'dev',
    cpu: parseInt(cpu, 10),
    memory: parseInt(memory, 10),
    port: parseInt(port, 10),
    tasks: parseInt(tasks, 10),
    vpcId,
    s3Bucket: s3Bucket || 'none',
    status: 'creating',
    repositoryUrl: 'N/A',
    albDnsName: 'N/A',
    awsProfile: awsProfile || 'default',
    createdAt: new Date().toISOString()
  };
  db.push(newDeployment);
  writeEcsDB(db);

  logHistory[ecsName] = [];
  res.json({ message: 'ECS deployment started', name: ecsName });

  const execute = async () => {
    try {
      sendLog(ecsName, `=== Copying Terraform Modules to Local Workspace ===`);
      // Run Linux shell execution to copy /home/ubuntu/modules/ecr and /home/ubuntu/modules/ecs into targetDir/modules
      await new Promise((resolve, reject) => {
        const cpEcr = spawn('cp', ['-r', '/home/ubuntu/modules/ecr', path.join(modulesDir, 'ecr')]);
        cpEcr.on('close', code => {
          if (code !== 0) reject(new Error('Failed to copy ECR module'));
          else {
            const cpEcs = spawn('cp', ['-r', '/home/ubuntu/modules/ecs', path.join(modulesDir, 'ecs')]);
            cpEcs.on('close', codeEcs => {
              if (codeEcs !== 0) reject(new Error('Failed to copy ECS module'));
              else resolve();
            });
          }
        });
      });

      sendLog(ecsName, `=== Initializing ECS/ECR Terraform Workspace for ${ecsName} ===`);
      await runCmd('terraform', ['init', '-no-color'], targetDir, ecsName, awsProfile);

      sendLog(ecsName, `=== Deploying ECS Cluster and ECR Registry (Fargate) ===`);
      await runCmd('terraform', ['apply', '-auto-approve', '-no-color'], targetDir, ecsName, awsProfile);

      sendLog(ecsName, `=== Fetching ECS Terraform Output ===`);
      const outputs = await getOutput(targetDir, awsProfile);

      const currentDB = readEcsDB();
      const match = currentDB.find(c => c.name === ecsName);
      if (match) {
        match.status = 'active';
        match.repositoryUrl = outputs.ecr_repository_url ? outputs.ecr_repository_url.value : 'N/A';
        match.albDnsName = outputs.alb_dns_name ? outputs.alb_dns_name.value : 'N/A';
        writeEcsDB(currentDB);
      }

      sendLog(ecsName, `=== ECS Cluster Successfully Deployed ===`);
      sendLog(ecsName, `Repository URL: ${outputs.ecr_repository_url ? outputs.ecr_repository_url.value : 'N/A'}`);
      sendLog(ecsName, `Load Balancer DNS Name: ${outputs.alb_dns_name ? outputs.alb_dns_name.value : 'N/A'}`);
    } catch (err) {
      sendLog(ecsName, `=== ECS DEPLOYMENT FAILED ===\nError: ${err.message}`);
      const currentDB = readEcsDB();
      const match = currentDB.find(c => c.name === ecsName);
      if (match) {
        match.status = 'failed';
        writeEcsDB(currentDB);
      }
    }
  };

  execute();
});

app.post('/api/ecs/destroy', requirePermission('ecs', 'execute'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const db = readEcsDB();
  const match = db.find(c => c.name === name);
  if (!match) return res.status(404).json({ error: 'ECS deployment not found' });

  const awsProfile = match.awsProfile || 'default';
  match.status = 'destroying';
  writeEcsDB(db);

  logHistory[name] = [];
  res.json({ message: 'ECS Destroy started', name });

  const execute = async () => {
    try {
      const targetDir = path.join(ECS_DEPLOYMENTS_DIR, name);
      const statePath = path.join(targetDir, 'terraform.tfstate');
      let hasResources = false;
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.resources && state.resources.length > 0) {
            hasResources = true;
          }
        } catch (e) {}
      }

      if (hasResources) {
        if (!fs.existsSync(path.join(targetDir, '.terraform'))) {
          sendLog(name, `=== Initializing Terraform for ${name} using profile "${awsProfile}" ===`);
          await runCmd('terraform', ['init', '-no-color'], targetDir, name, awsProfile);
        }
        sendLog(name, `=== Destroying ECS Cluster resources for ${name} using profile "${awsProfile}" ===`);
        await runCmd('terraform', ['destroy', '-auto-approve', '-no-color'], targetDir, name, awsProfile);
      } else {
        sendLog(name, `=== No resources found in state for ECS "${name}". Skipping Terraform execution. ===`);
      }

      sendLog(name, `=== Cleaning Deployment Files ===`);
      safeRmSync(targetDir);

      const currentDB = readEcsDB();
      const filtered = currentDB.filter(c => c.name !== name);
      writeEcsDB(filtered);

      sendLog(name, `=== ECS DESTRUCTION COMPLETE ===`);
    } catch (err) {
      sendLog(name, `=== ECS DESTRUCTION FAILED ===\nError: ${err.message}`);
      const currentDB = readEcsDB();
      const match = currentDB.find(c => c.name === name);
      if (match) {
        match.status = 'destroy-failed';
        writeEcsDB(currentDB);
      }
    }
  };

  execute();
});

// Start Server
app.listen(PORT, () => {
  console.log(`AWS Cloud Control Panel running on port ${PORT}`);
});
