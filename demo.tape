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

# Hidden setup
Hide
Type "source /Users/hadi.farhat/Documents/Explore/snaprevert/scripts/demo-init.sh && cd /tmp/demo-app && export PATH=/Users/hadi.farhat/Documents/Explore/snaprevert/scripts:$PATH && clear"
Enter
Sleep 2s
Show

# --- SCENE 1: Show project, start snaprevert ---
Type "cat app.js"
Enter
Sleep 2s

Type "snaprevert watch &"
Enter
Sleep 2s
Type "clear"
Enter
Sleep 500ms

# --- SCENE 2: Open Claude Code, ask it to add auth ---
Type "claude"
Enter
Sleep 1.5s

Type "add authentication with login route and JWT middleware"
Enter
Sleep 4s

# Exit Claude
Type "/exit"
Enter
Sleep 1s

# Let snaprevert catch the changes
Sleep 4s

Type "snaprevert list"
Enter
Sleep 3s

# --- SCENE 3: Open Claude again, bad refactor ---
Type "claude"
Enter
Sleep 1.5s

Type "refactor everything to TypeScript"
Enter
Sleep 4s

Type "/exit"
Enter
Sleep 1s

# Show the damage
Type "cat app.js"
Enter
Sleep 2s

Type "ls"
Enter
Sleep 1.5s

# Let snaprevert catch it
Sleep 4s

Type "snaprevert list"
Enter
Sleep 3s

# --- SCENE 4: Selective rollback (v0.2 feature) ---
Type "# auth.js is gone, app.js is broken. But middleware.js is fine."
Enter
Sleep 1.5s

Type "snaprevert back 2 --only app.js,auth.js --yes"
Enter
Sleep 2.5s

Type "cat app.js"
Enter
Sleep 2s

Type "cat auth.js"
Enter
Sleep 2s

# --- SCENE 5: Export snapshot as git patch (v0.2 feature) ---
Type "snaprevert export 2 --patch | head -5"
Enter
Sleep 2.5s

# --- SCENE 6: Status with metrics (v0.2 feature) ---
Type "snaprevert status"
Enter
Sleep 3s

# Cleanup
Hide
Type "kill %1 2>/dev/null"
Enter
Sleep 500ms
Show

Sleep 1s
