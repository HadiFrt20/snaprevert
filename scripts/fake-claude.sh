#!/bin/bash
# Simulates claude -p output for the VHS demo
# Makes real file changes so snaprevert captures them

PROMPT="$*"

case "$PROMPT" in
  *"add authentication"*)
    sleep 1
    echo ""
    echo "  I'll add an authentication module to your project."
    echo ""
    sleep 0.5

    cat > auth.js << 'AUTHEOF'
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const verify = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return verify === hash;
}

module.exports = { hashPassword, verifyPassword };
AUTHEOF

    cat > middleware.js << 'MWEOF'
function requireAuth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { requireAuth };
MWEOF

    # Modify app.js to import auth
    cat > app.js << 'APPEOF'
const express = require('express');
const { requireAuth } = require('./middleware');
const { hashPassword, verifyPassword } = require('./auth');

const app = express();
app.use(express.json());

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  res.json({ token: 'jwt-token-here' });
});

app.get('/protected', requireAuth, (req, res) => {
  res.json({ message: 'Welcome!' });
});

app.listen(3000);
APPEOF

    echo "  Created auth.js with password hashing"
    echo "  Created middleware.js with auth middleware"
    echo "  Updated app.js with login and protected routes"
    echo ""
    echo "  3 files changed"
    ;;

  *"refactor to TypeScript"*)
    sleep 1
    echo ""
    echo "  I'll convert your project to TypeScript."
    echo ""
    sleep 0.5

    # This "breaks" things
    cat > app.js << 'TSEOF'
import express, { Request, Response } from 'express';
import { requireAuth } from './middleware';

// ERROR: Cannot find module './auth' - file was renamed
const app: express.Application = express();

app.post('/login', (req: Request, res: Response) => {
  // TODO: implement
});

TSEOF

    rm -f config.js
    rm -f auth.js

    echo "  Converted app.js to TypeScript syntax"
    echo "  Removed config.js (merged into app.ts)"
    echo "  Removed auth.js (will recreate as auth.ts)"
    echo ""
    echo "  WARNING: middleware.js still uses require() syntax"
    echo "  3 files changed, 2 files deleted"
    ;;

esac
