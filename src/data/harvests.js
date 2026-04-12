const harvests = [
  {
    "id": 1,
    "ghId": 5,
    "name": "Melon Kajari Batch 1",
    "variety": "Kajari",
    "startDate": "2026-03-01",
    "endDate": null,
    "status": "live",
    "summary": {
      "revenue": 45000000,
      "costs": 28500000,
      "profit": 16500000
    },
    "assets": [
      {
        "itemId": 1,
        "itemName": "Rockwool slabs 1m",
        "qty": 45,
        "fifo_cost": 3830000,
        "date": "2026-03-02",
        "reusable": true,
        "condition": "new"
      },
      {
        "itemId": 3,
        "itemName": "Drippers 2 LPH",
        "qty": 90,
        "fifo_cost": 225000,
        "date": "2026-03-02",
        "reusable": true,
        "condition": "new"
      }
    ],
    "usage": [
      {
        "itemId": 2,
        "itemName": "AB Mix Nutrient A",
        "qty": 0.2,
        "displayQty": "200g",
        "fifo_cost": 15000,
        "date": "2026-03-10"
      }
    ],
    "sales": [
      {
        "date": "2026-04-10",
        "product": "Melon Kajari",
        "qty": "50 kg",
        "unitPrice": 25000,
        "amount": 1250000,
        "buyer": "Pasar Tradisional"
      },
      {
        "date": "2026-04-08",
        "product": "Melon Kajari",
        "qty": "30 kg",
        "unitPrice": 28000,
        "amount": 840000,
        "buyer": "Restaurant Nusantara"
      },
      {
        "date": "2026-04-05",
        "product": "Melon Kajari",
        "qty": "100 kg",
        "unitPrice": 22000,
        "amount": 2200000,
        "buyer": "Tokopedia Market"
      }
    ]
  }
];

export default harvests;
