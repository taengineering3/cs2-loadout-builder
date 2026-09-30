import json
import re
import requests

url = "https://api.skinport.com/v1/items"
params = {"app_id": 730, "currency": "EUR"}
headers = {"Accept-Encoding": "br"}

response = requests.get(url, params=params, headers=headers)
response.raise_for_status()
items = response.json()

prices = {}    # cheapest price across all wears (used by the site today)
by_wear = {}   # price for each wear, e.g. by_wear["AK-47 | Redline"]["Field-Tested"]

for item in items:
    name = item["market_hash_name"]
    price = item["min_price"]

    if price is None:
        continue
    if "StatTrak" in name or "Souvenir" in name:
        continue

    # remove the wear, e.g. "AK-47 | Redline (Field-Tested)" -> "AK-47 | Redline"
    base_name = re.sub(r" \([^)]*\)$", "", name)

    # cheapest price across all wears
    if base_name not in prices or price < prices[base_name]:
        prices[base_name] = price

    # price for this specific wear
    wear_match = re.search(r" \(([^)]+)\)$", name)
    if wear_match:
        wear = wear_match.group(1)
        wears = by_wear.setdefault(base_name, {})
        if wear not in wears or price < wears[wear]:
            wears[wear] = price

with open("prices.json", "w") as f:
    json.dump(prices, f)

with open("prices_by_wear.json", "w") as f:
    json.dump(by_wear, f)

print("Saved prices for", len(prices), "skins")
print("Saved wear prices for", len(by_wear), "skins")