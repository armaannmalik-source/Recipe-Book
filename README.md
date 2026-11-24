# Recipe Book

A minimal, installable personal cookbook. It starts empty so you can add only your own recipes.

## Features in this first build
- Add, view, edit and delete recipes
- Categories and search
- Favourites
- JSON backup and restore (photos included)
- Serving-size adjustment with automatic scaling for recognised leading ingredient quantities
- Optional recipe photos (up to 5 MB each)
- Ingredients, instructions, cooking time and personal notes
- Local device storage with IndexedDB
- Light and dark themes with saved preference
- PWA manifest and offline app shell

## Run it
Because browser storage and service workers need a secure context, use a local web server rather than opening `index.html` directly.

With Python installed:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000`.

To publish, upload the contents of this folder to a GitHub repository and enable GitHub Pages. Use the repository's Pages URL to install it on Android or desktop.

## Important storage note
Recipes are stored in the browser on the device where you add them. They are not synced between devices. Clearing the browser's site data can erase them. Use the Backup button regularly to download a JSON copy. Restore merges recipes into the current collection; matching recipe IDs are updated.

## Branding update
The supplied steaming pot and spatula illustration is used as the header logo, browser icon, and PWA install icon.
