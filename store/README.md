# Store assets

`screenshots/` holds the five 1280×800 PNGs the stores ask for. `STORE_LISTING.md`
says what each one shows.

`promo-440x280.png` is the small promotional image the Chrome Web Store and Edge show in
lists: the extension's cube, "Glassy Capture" in Satoshi Bold, and "Save it now. Find it
later." (the website's line for the extension), on the app's `#0c0c14`. `logo-300x300.png`
is the store logo Edge asks for, the same cube from the app's 512×512 icon.

## How they are made

They are pictures of the real popup and side panel from this build, signed in to a
local Glassy that holds sample data only (an invented reader, invented pages). Each
picture is the extension page laid over the sample web page it was opened on. Nothing
in them comes from a real account.

Retake them when the popup changes:

1. `npm run build`
2. Start a local Glassy and add sample data.
3. Load `dist/` in Chromium with Playwright, open `src/popup/index.html` and
   `src/sidepanel/index.html` as tabs, and take the pictures.

The script used for v2.21.1 and v2.21.2 lives outside this repo (it starts a Glassy server from the
app's source). `npm run store:check` checks that all five exist and are 1280×800.
