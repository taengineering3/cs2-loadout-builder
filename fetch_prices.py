import json
import re
import requests

url = "https://api.skinport.com/v1/items"
params = {"app_id": 730, "currency": "EUR"}
headers = {"Accept-Encoding": "br"}

response = requests.get(url, params=params, headers=headers)
response.raise_for_status()
items = response.json()

prices = {}
for item in items:
    name = item["market_hash_name"]
    price = item["min_price"]

    if price is None:
        continue
    if "StatTrak" in name or "Souvenir" in name:
        continue

    # remove the wear, e.g. "AK-47 | Redline (Field-Tested)" -> "AK-47 | Redline"
    base_name = re.sub(r" \([^)]*\)$", "", name)

    # keep the cheapest price across all wears
    if base_name not in prices or price < prices[base_name]:
        prices[base_name] = price

with open("prices.json", "w") as f:
    json.dump(prices, f)

print("Saved prices for", len(prices), "skins")