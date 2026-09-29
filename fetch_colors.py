import io
import json
import requests
import numpy as np
from PIL import Image
from concurrent.futures import ThreadPoolExecutor

SKINS_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json"

skins = requests.get(SKINS_URL).json()
with open("prices.json") as f:
    prices = json.load(f)

# only analyse skins that have a price
todo = [s for s in skins if s["name"] in prices]
print("Analysing", len(todo), "skins...")


def analyse(skin):
    try:
        data = requests.get(skin["image"], timeout=20).content
        img = Image.open(io.BytesIO(data)).convert("RGBA")
        img.thumbnail((128, 128))

        rgba = np.array(img)
        opaque = rgba[:, :, 3] > 128          # ignore transparent background
        if opaque.sum() == 0:
            return skin["name"], None

        hsv = np.array(img.convert("RGB").convert("HSV"))
        h = hsv[:, :, 0][opaque].astype(float) * 360 / 255   # hue in degrees
        s = hsv[:, :, 1][opaque]                              # saturation
        v = hsv[:, :, 2][opaque]                              # brightness
        total = len(h)

        black = v < 60
        colourless = (~black) & (s < 50)
        white = colourless & (v > 170)
        grey = colourless & (v <= 170)
        coloured = (~black) & (~colourless)

        def frac(mask):
            return round(float(mask.sum()) / total, 3)

        result = {
            "black": frac(black),
            "white": frac(white),
            "grey": frac(grey),
            "red": frac(coloured & ((h < 15) | (h >= 345))),
            "orange": frac(coloured & (h >= 15) & (h < 45)),
            "yellow": frac(coloured & (h >= 45) & (h < 70)),
            "green": frac(coloured & (h >= 70) & (h < 170)),
            "blue": frac(coloured & (h >= 170) & (h < 255)),
            "purple": frac(coloured & (h >= 255) & (h < 295)),
            "pink": frac(coloured & (h >= 295) & (h < 345)),
        }
        return skin["name"], result
    except Exception:
        return skin["name"], None


colors = {}
done = 0
with ThreadPoolExecutor(max_workers=16) as pool:
    for name, result in pool.map(analyse, todo):
        done += 1
        if result:
            colors[name] = result
        if done % 100 == 0:
            print(done, "/", len(todo))

with open("colors.json", "w") as f:
    json.dump(colors, f)

print("Saved colours for", len(colors), "skins")