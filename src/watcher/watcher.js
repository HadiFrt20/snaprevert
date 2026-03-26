/**
 * Chokidar file watcher with ignore patterns and change buffer integration.
 */

const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { buildIgnoreFilter } = require('./ignore');
const { ChangeBuffer } = require('./change-buffer');
const { loadConfig } = require('../utils/config');

class Watcher {
  constructor(projectDir, options = {}) {
    this.projectDir = projectDir;
    this.options = options;
    this.chokidarWatcher = null;
    this.shouldWatch = null;
    this.changeBuffer = null;
    this.running = false;
  }

  start() {
    const config = loadConfig(this.projectDir);
    const debounceMs = this.options.debounceMs || config.debounce_ms;

    this.shouldWatch = buildIgnoreFilter(this.projectDir, config.ignore_patterns);

    this.changeBuffer = new ChangeBuffer(this.projectDir, {
      debounceMs,
      maxFileSizeKb: config.max_file_size_kb,
      onSnapshot: this.options.onSnapshot || (() => {}),
    });

    // Initialize file content cache
    const files = this.scanFiles();
    this.changeBuffer.initCache(files);

    this.chokidarWatcher = chokidar.watch(this.projectDir, {
      ignored: (filePath) => {
        // Always allow the root dir
        if (filePath === this.projectDir) return false;
        return !this.shouldWatch(filePath);
      },
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
    });

    this.chokidarWatcher.on('add', (filePath) => {
      this.changeBuffer.add('added', filePath);
    });

    this.chokidarWatcher.on('change', (filePath) => {
      this.changeBuffer.add('modified', filePath);
    });

    this.chokidarWatcher.on('unlink', (filePath) => {
      this.changeBuffer.add('deleted', filePath);
    });

    this.running = true;
    return this;
  }

  async stop() {
    if (this.changeBuffer) {
      await this.changeBuffer.flush();
      this.changeBuffer.clear();
    }
    if (this.chokidarWatcher) {
      await this.chokidarWatcher.close();
      this.chokidarWatcher = null;
    }
    this.running = false;
  }

  scanFiles() {
    const files = [];
    const scan = (dir) => {
      try {
        for (const entry of fs.readdirSync(dir)) {
          const fullPath = path.join(dir, entry);
          if (!this.shouldWatch(fullPath)) continue;
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scan(fullPath);
          } else {
            const rel = path.relative(this.projectDir, fullPath).replace(/\\/g, '/');
            files.push(rel);
          }
        }
      } catch {
        // Skip unreadable dirs
      }
    };
    scan(this.projectDir);
    return files;
  }
}

module.exports = { Watcher };
