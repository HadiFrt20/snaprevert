Output demo.gif

Require snaprevert

Set Shell "bash"
Set FontSize 15
Set Width 1000
Set Height 650
Set Theme "Catppuccin Mocha"
Set Padding 15
Set TypingSpeed 35ms
Set CursorBlink false

# Hidden: run setup script, cd into project, set PATH
Hide
Type "source /Users/hadi.farhat/Documents/Explore/snaprevert/scripts/demo-init.sh && cd /tmp/demo-app && export PATH=/Users/hadi.farhat/Documents/Explore/snaprevert/scripts:$PATH && clear"
Enter
Sleep 2s
Show

# --- Show project ---
Type "ls"
Enter
Sleep 1.5s

Type "cat app.js"
Enter
Sleep 2.5s

# --- Start snaprevert ---
Type "snaprevert snap --label 'v1: working express app'"
Enter
Sleep 2s

Type "snaprevert watch &"
Enter
Sleep 2.5s

Type "clear"
Enter
Sleep 500ms

# --- Claude adds auth ---
Type "claude -p 'add authentication with login route and middleware'"
Enter
Sleep 3.5s

Type "ls"
Enter
Sleep 2s

Sleep 4s

Type "snaprevert list"
Enter
Sleep 3s

# --- Claude breaks things ---
Type "claude -p 'refactor the entire project to TypeScript'"
Enter
Sleep 3.5s

Type "cat app.js"
Enter
Sleep 2.5s

Type "ls"
Enter
Sleep 2s

Sleep 4s

Type "snaprevert list"
Enter
Sleep 3s

# --- Rollback ---
Type "# config.js gone. auth.js gone. app.js broken. Roll it back."
Enter
Sleep 2s

Type "snaprevert back 2 --yes"
Enter
Sleep 2.5s

# --- Verify restore ---
Type "ls"
Enter
Sleep 1.5s

Type "cat app.js"
Enter
Sleep 2.5s

Type "cat auth.js"
Enter
Sleep 2.5s

Type "snaprevert status"
Enter
Sleep 3s

# --- Cleanup ---
Hide
Type "kill %1 2>/dev/null"
Enter
Sleep 500ms
Show

Sleep 1s
