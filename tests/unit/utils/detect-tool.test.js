const fs = require('fs');
const path = require('path');
const { createTempProject } = require('../../helpers/temp-project');

// We need to re-require detect-tool in each test to pick up mocked env/process list.
// Use jest.isolateModules to get fresh module state.

describe('detectTool', () => {
  let project;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    project = createTempProject({});
    // Clean up any env vars that might interfere
    delete process.env.CLAUDE_CODE;
  });

  afterEach(() => {
    project.cleanup();
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  function requireDetectTool() {
    let mod;
    jest.isolateModules(() => {
      mod = require('../../../src/utils/detect-tool');
    });
    return mod;
  }

  test('returns null when no tool detected', () => {
    // Mock execSync to return an empty process list (no AI tool processes)
    jest.mock('child_process', () => ({
      execSync: jest.fn().mockReturnValue('USER  PID  %CPU  %MEM  COMMAND\nroot  1  0.0  0.0  /sbin/init'),
    }));

    const { detectTool } = requireDetectTool();
    const result = detectTool(project.dir);
    expect(result).toBeNull();
  });

  test('detects .cursor/ directory -> cursor', () => {
    // Create .cursor directory in project
    fs.mkdirSync(path.join(project.dir, '.cursor'), { recursive: true });

    // Mock process list with no matching processes
    jest.mock('child_process', () => ({
      execSync: jest.fn().mockReturnValue('USER  PID  COMMAND\nroot  1  /sbin/init'),
    }));

    const { detectTool } = requireDetectTool();
    const result = detectTool(project.dir);
    expect(result).toBe('cursor');
  });

  test('detects .windsurf/ directory -> windsurf', () => {
    // Create .windsurf directory in project
    fs.mkdirSync(path.join(project.dir, '.windsurf'), { recursive: true });

    // Mock process list with no matching processes
    jest.mock('child_process', () => ({
      execSync: jest.fn().mockReturnValue('USER  PID  COMMAND\nroot  1  /sbin/init'),
    }));

    const { detectTool } = requireDetectTool();
    const result = detectTool(project.dir);
    expect(result).toBe('windsurf');
  });

  test('detects CLAUDE_CODE env var -> claude', () => {
    process.env.CLAUDE_CODE = '1';

    // Mock process list with no matching processes
    jest.mock('child_process', () => ({
      execSync: jest.fn().mockReturnValue('USER  PID  COMMAND\nroot  1  /sbin/init'),
    }));

    const { detectTool } = requireDetectTool();
    const result = detectTool(project.dir);
    expect(result).toBe('claude');
  });

  test('returns first match when multiple signals present', () => {
    // CLAUDE_CODE env var is checked first in the function
    process.env.CLAUDE_CODE = '1';
    // Also create .cursor directory
    fs.mkdirSync(path.join(project.dir, '.cursor'), { recursive: true });

    // Mock process list that also contains Cursor
    jest.mock('child_process', () => ({
      execSync: jest.fn().mockReturnValue('USER  PID  COMMAND\nuser  100  Cursor'),
    }));

    const { detectTool } = requireDetectTool();
    const result = detectTool(project.dir);
    // Claude is checked first, so it should win
    expect(result).toBe('claude');
  });
});
