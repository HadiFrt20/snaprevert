#!/bin/bash
# Sets up the demo environment
rm -rf /tmp/demo-app
mkdir -p /tmp/demo-app
cd /tmp/demo-app

cat > app.js << 'EOF'
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Hello World' });
});

app.listen(3000);
EOF

cat > config.js << 'EOF'
module.exports = {
  port: 3000,
  env: 'development',
  database: 'postgres://localhost/myapp'
};
EOF

cat > routes.js << 'EOF'
const router = require('express').Router();

router.get('/users', (req, res) => {
  res.json([]);
});

module.exports = router;
EOF

# Alias claude to our fake for the demo
export PATH="/Users/hadi.farhat/Documents/Explore/snaprevert/scripts:$PATH"
