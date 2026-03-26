const crypto = require('crypto');

function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function shortId() {
  return crypto.randomBytes(4).toString('hex');
}

module.exports = { hash, shortId };
