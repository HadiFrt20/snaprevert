Output demo.gif

Set Shell "bash"
Set FontSize 16
Set Width 900
Set Height 600
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 40ms

# Title
Type "# snaprevert - the undo button for AI coding"
Enter
Sleep 1s
Type "clear"
Enter
Sleep 500ms

# Create a demo project
Type "mkdir my-app && cd my-app"
Enter
Sleep 500ms

Type "echo 'console.log(1)' > app.js"
Enter
Sleep 300ms

Type "echo 'port = 3000' > config.js"
Enter
Sleep 300ms

Type "echo '# routes' > routes.js"
Enter
Sleep 500ms

# Initialize snaprevert and create first snapshot
Type "snaprevert snap --label 'initial project setup'"
Enter
Sleep 2s

# Show the snapshot
Type "snaprevert list"
Enter
Sleep 2s

# Simulate AI making changes
Type@50ms "# AI assistant rewrites your code..."
Enter
Sleep 1s

Type "echo 'const app = require(express)' > app.js"
Enter
Sleep 300ms

Type "echo 'port = 8080' > config.js"
Enter
Sleep 300ms

Type "echo 'router = express.Router()' > routes.js"
Enter
Sleep 300ms

Type "echo 'stripe = require(stripe)' > payments.js"
Enter
Sleep 500ms

Type "snaprevert snap --label 'AI: added express + payments'"
Enter
Sleep 2s

# More AI changes that break things
Type@50ms "# AI makes more changes that break everything..."
Enter
Sleep 1s

Type "echo 'BROKEN CODE %%%' > app.js"
Enter
Sleep 300ms

Type "rm config.js"
Enter
Sleep 300ms

Type "snaprevert snap --label 'AI: refactor attempt (broken)'"
Enter
Sleep 2s

# Show all snapshots
Type "snaprevert list"
Enter
Sleep 3s

# Show what changed
Type "snaprevert diff 3"
Enter
Sleep 3s

# Roll back!
Type@50ms "# Everything is broken. Lets go back!"
Enter
Sleep 1s

Type "snaprevert back 1 --yes"
Enter
Sleep 2s

# Verify
Type "cat app.js"
Enter
Sleep 1.5s

Type "cat config.js"
Enter
Sleep 1.5s

# Show status
Type "snaprevert status"
Enter
Sleep 3s

Type@50ms "# Back to working code in under 1 second!"
Enter
Sleep 2s
