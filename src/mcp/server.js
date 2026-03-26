/**
 * MCP (Model Context Protocol) server for snaprevert.
 * Exposes snapshot tools to AI agents over JSON-RPC 2.0 via stdin/stdout.
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { init, isInitialized, getTotalSize } = require('../storage/store');
const { listSnapshots, loadSnapshot } = require('../storage/serializer');
const { rollback } = require('../engine/rollback');
const { getCurrentState } = require('../engine/state');
const { ChangeBuffer } = require('../watcher/change-buffer');
const { buildIgnoreFilter } = require('../watcher/ignore');

const SERVER_INFO = {
  name: 'snaprevert',
  version: require('../../package.json').version,
};

const TOOLS = [
  {
    name: 'snaprevert_checkpoint',
    description: 'Create a named checkpoint (snapshot) of the current project state',
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'A descriptive label for the checkpoint',
        },
      },
      required: ['label'],
    },
  },
  {
    name: 'snaprevert_list',
    description: 'List recent snapshots with their metadata',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of snapshots to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'snaprevert_rollback',
    description: 'Roll back the project to the state before a given snapshot number',
    inputSchema: {
      type: 'object',
      properties: {
        number: {
          type: 'number',
          description: 'The snapshot number to roll back to',
        },
      },
      required: ['number'],
    },
  },
  {
    name: 'snaprevert_diff',
    description: 'Show what changed in a specific snapshot (diffs and added files)',
    inputSchema: {
      type: 'object',
      properties: {
        number: {
          type: 'number',
          description: 'The snapshot number to inspect',
        },
      },
      required: ['number'],
    },
  },
  {
    name: 'snaprevert_status',
    description: 'Get current snaprevert status including snapshot counts and storage info',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Execute a tool call and return the result.
 */
function executeTool(projectDir, name, args) {
  switch (name) {
    case 'snaprevert_checkpoint':
      return handleCheckpoint(projectDir, args);
    case 'snaprevert_list':
      return handleList(projectDir, args);
    case 'snaprevert_rollback':
      return handleRollback(projectDir, args);
    case 'snaprevert_diff':
      return handleDiff(projectDir, args);
    case 'snaprevert_status':
      return handleStatus(projectDir, args);
    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32601 });
  }
}

function handleCheckpoint(projectDir, args) {
  const label = args.label;
  if (!label || typeof label !== 'string') {
    throw Object.assign(new Error('label is required and must be a string'), { code: -32602 });
  }

  if (!isInitialized(projectDir)) {
    init(projectDir);
  }

  const shouldWatch = buildIgnoreFilter(projectDir);
  const buffer = new ChangeBuffer(projectDir, { debounceMs: 0 });

  const snapshots = listSnapshots(projectDir);
  const files = scanFiles(projectDir, shouldWatch);

  buffer.initCache(files);

  const changes = files.map((f) => ({
    type: snapshots.length === 0 ? 'added' : 'modified',
    filePath: f,
  }));

  if (changes.length === 0) {
    return { number: null, label, timestamp: Date.now(), message: 'No files to snapshot' };
  }

  const meta = buffer.createSnapshot(changes);

  if (meta) {
    // Override auto-generated label with the user-provided one
    const metaPath = path.join(projectDir, '.snaprevert', 'snapshots', meta.name, 'meta.json');
    const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    metaData.label = label;
    fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2), 'utf-8');
    meta.label = label;

    return {
      number: meta.number,
      label: meta.label,
      timestamp: meta.timestamp,
    };
  }

  return { number: null, label, timestamp: Date.now(), message: 'No changes to snapshot' };
}

function handleList(projectDir, args) {
  if (!isInitialized(projectDir)) {
    return [];
  }

  const limit = (args && args.limit) || 20;
  const snapshots = listSnapshots(projectDir);

  return snapshots.slice(-limit).map((s) => ({
    number: s.number,
    label: s.label,
    status: s.status,
    type: s.type || 'auto',
    timestamp: s.timestamp,
    changes: (s.changes || []).length,
  }));
}

function handleRollback(projectDir, args) {
  const number = args.number;
  if (typeof number !== 'number') {
    throw Object.assign(new Error('number is required and must be a number'), { code: -32602 });
  }

  if (!isInitialized(projectDir)) {
    throw Object.assign(new Error('No .snaprevert/ found. Run snaprevert watch first.'), { code: -32600 });
  }

  const result = rollback(projectDir, number, { yes: true });

  return {
    success: true,
    target: result.target.number,
    filesModified: result.filesModified,
    filesRemoved: result.filesRemoved,
    filesRestored: result.filesRestored,
    partialRollback: result.partialRollback,
    undoneSnapshots: result.toUndo.map((s) => s.number),
  };
}

function handleDiff(projectDir, args) {
  const number = args.number;
  if (typeof number !== 'number') {
    throw Object.assign(new Error('number is required and must be a number'), { code: -32602 });
  }

  if (!isInitialized(projectDir)) {
    throw Object.assign(new Error('No .snaprevert/ found. Run snaprevert watch first.'), { code: -32600 });
  }

  const snapshots = listSnapshots(projectDir);
  const target = snapshots.find((s) => s.number === number);

  if (!target) {
    throw Object.assign(new Error(`Snapshot #${number} not found`), { code: -32602 });
  }

  const snapshot = loadSnapshot(projectDir, target.name);
  if (!snapshot) {
    throw Object.assign(new Error(`Could not load snapshot #${number}`), { code: -32600 });
  }

  return {
    number: target.number,
    label: target.label,
    status: target.status,
    timestamp: target.timestamp,
    changes: target.changes || [],
    diffs: snapshot.diffs,
    addedFiles: Object.keys(snapshot.addedFiles || {}),
  };
}

function handleStatus(projectDir) {
  if (!isInitialized(projectDir)) {
    return {
      initialized: false,
      message: 'No .snaprevert/ found. Run snaprevert watch to start.',
    };
  }

  const snapshots = listSnapshots(projectDir);
  const state = getCurrentState(projectDir);

  const active = snapshots.filter((s) => s.status === 'active').length;
  const rolledBack = snapshots.filter((s) => s.status === 'rolled-back').length;

  return {
    initialized: true,
    projectDir,
    totalSnapshots: snapshots.length,
    active,
    rolledBack,
    storageSize: getTotalSize(projectDir),
    current: state.current,
    latestSnapshot: snapshots.length > 0
      ? {
          number: snapshots[snapshots.length - 1].number,
          label: snapshots[snapshots.length - 1].label,
          timestamp: snapshots[snapshots.length - 1].timestamp,
        }
      : null,
  };
}

/**
 * Scan project files respecting ignore rules.
 */
function scanFiles(projectDir, shouldWatch) {
  const files = [];
  const scan = (dir) => {
    try {
      for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        if (!shouldWatch(fullPath)) continue;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scan(fullPath);
        } else {
          files.push(path.relative(projectDir, fullPath).replace(/\\/g, '/'));
        }
      }
    } catch {
      // skip
    }
  };
  scan(projectDir);
  return files;
}

/**
 * Handle a single JSON-RPC request and return the response object.
 */
function handleRequest(projectDir, request) {
  const { jsonrpc, id, method, params } = request;

  if (jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', id: id || null, error: { code: -32600, message: 'Invalid JSON-RPC version' } };
  }

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: SERVER_INFO,
          },
        };
      }

      case 'notifications/initialized': {
        // Client acknowledgement; no response needed for notifications
        return null;
      }

      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS,
          },
        };
      }

      case 'tools/call': {
        const toolName = params && params.name;
        const toolArgs = (params && params.arguments) || {};

        try {
          const result = executeTool(projectDir, toolName, toolArgs);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            },
          };
        } catch (err) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: err.message }),
                },
              ],
              isError: true,
            },
          };
        }
      }

      default: {
        return {
          jsonrpc: '2.0',
          id: id || null,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
      }
    }
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id: id || null,
      error: { code: -32603, message: err.message || 'Internal error' },
    };
  }
}

/**
 * Start the MCP server, reading JSON-RPC from stdin and writing responses to stdout.
 */
function startServer(projectDir) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request;
    try {
      request = JSON.parse(trimmed);
    } catch {
      const response = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
      process.stdout.write(JSON.stringify(response) + '\n');
      return;
    }

    const response = handleRequest(projectDir, request);

    // Notifications (no id) may return null — don't send a response
    if (response !== null) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

module.exports = { startServer, handleRequest, TOOLS };
