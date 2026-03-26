const fs = require('fs');
const path = require('path');
const os = require('os');

function createTempProject(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snaprevert-test-'));

  for (const [filePath, content] of Object.entries(files)) {
    const absPath = path.join(dir, filePath);
    const dirName = path.dirname(absPath);
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
    fs.writeFileSync(absPath, content, 'utf-8');
  }

  const cleanup = () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  };

  return { dir, cleanup };
}

function addFile(dir, filePath, content) {
  const absPath = path.join(dir, filePath);
  const dirName = path.dirname(absPath);
  if (!fs.existsSync(dirName)) {
    fs.mkdirSync(dirName, { recursive: true });
  }
  fs.writeFileSync(absPath, content, 'utf-8');
}

function modifyFile(dir, filePath, content) {
  const absPath = path.join(dir, filePath);
  fs.writeFileSync(absPath, content, 'utf-8');
}

function deleteFile(dir, filePath) {
  const absPath = path.join(dir, filePath);
  if (fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
  }
}

function readFile(dir, filePath) {
  const absPath = path.join(dir, filePath);
  return fs.readFileSync(absPath, 'utf-8');
}

function fileExists(dir, filePath) {
  return fs.existsSync(path.join(dir, filePath));
}

function listFiles(dir) {
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d)) {
      const full = path.join(d, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        files.push(path.relative(dir, full).replace(/\\/g, '/'));
      }
    }
  }
  walk(dir);
  return files.sort();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  createTempProject,
  addFile,
  modifyFile,
  deleteFile,
  readFile,
  fileExists,
  listFiles,
  sleep,
};
