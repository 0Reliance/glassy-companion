# For AI agents

You are reading the Glassy Capture repository: the browser extension that saves pages,
highlights, screenshots and notes into a person's Glassy. You can get it ready for them and
check it works. Loading an extension into a browser takes the person's own clicks (browsers
require it for an extension that is not from their store), so your job is to make those clicks
the only thing left.

## Install it for a person

**Done when:** the extension shows in their browser, they have signed in, and a test save is in
their Glassy.

1. **Ask, in one message:**
   - Which browser: Chrome, Edge, Brave, Arc or Opera (one build), or Firefox 140 or newer (another).
   - Where their Glassy is: `https://app.glassy.fyi` (our cloud), `https://clear.glassy.fyi`
     (Clear), or their own (for example `http://localhost:3000`). If they have none yet, stop:
     they sign up free at https://app.glassy.fyi/#/register, or you install one with
     https://github.com/0Reliance/glassy-selfhost/blob/main/AGENTS.md first.
2. **Check their Glassy answers:** `GET <address>/api/health` returns `"status":"ok"`. If not,
   say so and stop; the extension cannot sign in to a Glassy that isn't running.
3. **Download the latest release** into a folder that will stay (not a temporary one, because
   Chrome loads the folder in place). For example:

   ```bash
   mkdir -p ~/glassy-capture && cd ~/glassy-capture
   gh release download --repo 0Reliance/glassy-companion --pattern 'glassy-companion-v*' --clobber
   unzip -o glassy-companion-v*[0-9].zip -d chrome    # Chromium browsers
   ```

   Without `gh`, take the two assets from https://github.com/0Reliance/glassy-companion/releases/latest.
   Check the unzipped `chrome/manifest.json` carries the release's `"version"`.
4. **Hand them the clicks**, with the real path filled in:
   - Chromium: open `chrome://extensions` (or `edge://`, `brave://`, `opera://extensions`), turn
     on **Developer mode**, click **Load unpacked**, choose `~/glassy-capture/chrome`.
   - Firefox: open `about:debugging` → **This Firefox** → **Load Temporary Add-on**, choose the
     `.xpi`. Tell them it stays until Firefox restarts (it isn't signed by Mozilla yet).
5. **Sign in.** On their own Glassy, they open the extension's settings and set the server
   address first. Then they click the Glassy icon and sign in with their Glassy account. Never
   ask for their password: they type it into the extension themselves.
6. **Prove it.** Ask them to open any article and press `Ctrl+Shift+G` (`⌘+Shift+G` on a Mac).
   If you have your own key to their Glassy, find the save yourself (`glassy_search` with the
   page's title); otherwise ask them to look in Keep.

**Stop and ask** before installing `gh`, `unzip` or anything else on their machine, and before
changing any browser setting yourself.

**Hand-back:** which browser and build you prepared, the folder, which Glassy it signs in to,
whether the test save was found and how you checked, and anything you could not check.

## Using it alongside them

- What they save is yours to read through Glassy's own tools (your named agent key, the Glassy
  MCP endpoint), not through the extension. Saved pages arrive as bookmarks; a highlight and the
  note on it are part of the page's searchable text.
- The extension's settings show the exact MCP setup for Claude, Codex, Cursor and other agents.
  Connecting yourself is covered in the self-host guide:
  https://github.com/0Reliance/glassy-selfhost/blob/main/agents/CONFIGURE.md.

## When it doesn't work

| They see | It means | Do this |
|---|---|---|
| "Server URL must use HTTPS…" | The address is plain `http` on a public host | Use `https`, or a local, LAN or `*.ts.net` address. |
| Sign-in fails | Wrong address or account | Check `GET <address>/api/health`, then the email. Their own Glassy has one account: theirs. |
| A save says "Saved on this device" | Their Glassy isn't reachable right now | Nothing is lost; it goes through when the Glassy is back. Check it is running. |
| Firefox: the add-on is gone | Firefox restarted | Load the `.xpi` again (step 4). |

Problems with these instructions: https://github.com/0Reliance/glassy-companion/issues.
