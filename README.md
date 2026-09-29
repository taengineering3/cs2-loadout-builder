# CS2 Loadout Builder

A web app for Counter-Strike 2 players to browse skins with market prices and generate themed loadouts.

**Live site:** https://taengineering3.github.io/cs2-loadout-builder/

Pick a colour theme, set a total budget range, choose which weapon slots you want, lock in the skins you already know you want, and the app builds the rest of the loadout around them.

> This is my first web project, built from scratch while learning HTML, CSS, JavaScript and Python.

## Features

- **Browse skins** with images, rarity colours and prices, with search, category filter and min/max price filter
- **Loadout generator** that picks one skin per selected slot so the total lands inside your budget
- **Colour themes** (red, blue, black, and more) based on image analysis of every skin
- **Locked items**: choose specific skins and the generator builds around them
- **Reroll** any single slot without breaking the budget

## How it works

1. **Skin data** comes from the open-source [CSGO-API](https://github.com/ByMykel/CSGO-API) (names, weapons, rarities, images).
2. **Prices** are fetched by `fetch_prices.py` from the [Skinport API](https://docs.skinport.com/) and saved to `prices.json`. The price shown is the cheapest listed wear ("from" price).
3. **Colours** are computed once by `fetch_colors.py`, which downloads each skin image, converts pixels to HSV and measures what fraction of the skin falls into each named colour bucket. The result is saved to `colors.json`.
4. **The generator** (in `script.js`) filters skins per slot by theme, then picks skins at random (weighted towards the chosen colour) while reserving the cheapest possible skins for the remaining slots, so the total stays within budget. It retries up to 1000 times if a combination misses the range.

## Run it locally

You need a browser, a code editor with a local server (for example the VS Code **Live Server** extension), and Python 3 if you want to refresh the data.

```bash
# 1. Install the Python libraries
pip3 install requests brotli pillow numpy

# 2. Refresh prices (don't run this too often, the API is rate limited)
python3 fetch_prices.py

# 3. Recompute colours (only needed when new skins are added)
python3 fetch_colors.py
```

Then open `index.html` with Live Server. Opening the file directly will not work, because browsers block loading the JSON files that way.

## Project structure

```
index.html         page structure
style.css          styling
script.js          browsing, filters, generator, locking, themes
fetch_prices.py    downloads prices -> prices.json
fetch_colors.py    analyses skin images -> colors.json
prices.json        price snapshot
colors.json        colour data
```

## Known limitations

- Prices are a snapshot from the last time `fetch_prices.py` was run, not live.
- Prices are the cheapest wear per skin, so real totals are usually higher.
- Only some weapon slots are supported so far.
- Colour matching is approximate: it measures how much of a skin's image falls in each colour range.

## Roadmap

- Wear-specific prices
- More weapon slots
- Skin detail pages
- Shareable loadout links
- Improved design and mobile layout

## Disclaimer

This project is not affiliated with, endorsed by or sponsored by Valve Corporation. Counter-Strike and all related skin names and images are trademarks or property of Valve. Skin data is provided by CSGO-API and prices by Skinport.

## License

The code in this repository is released under the [MIT License](LICENSE). This does not cover Valve's skin names and images or third-party data.
