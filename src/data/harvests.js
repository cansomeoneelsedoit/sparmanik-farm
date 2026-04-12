const harvests = [
  {
    "id": 1,
    "ghId": 2,
    "name": "Melon Harvest 1",
    "variety": "Yellow Melon",
    "startDate": "2025-03-01",
    "endDate": null,
    "status": "live",
    "assets": [
      {
        "itemId": 1,
        "itemName": "Rockwool slabs 1m",
        "qty": 45,
        "fifo_cost": 3830000,
        "date": "2025-03-02",
        "reusable": true,
        "condition": "new"
      },
      {
        "itemId": 3,
        "itemName": "Drippers 2 LPH",
        "qty": 90,
        "fifo_cost": 225000,
        "date": "2025-03-02",
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
        "date": "2025-03-10"
      },
      {
        "itemId": 2,
        "itemName": "AB Mix Nutrient A",
        "qty": 0.35,
        "displayQty": "350g",
        "fifo_cost": 26250,
        "date": "2025-03-17"
      },
      {
        "itemId": 2,
        "itemName": "AB Mix Nutrient A",
        "qty": 0.5,
        "displayQty": "500g",
        "fifo_cost": 37500,
        "date": "2025-03-25"
      }
    ],
    "sales": [
      {
        "date": "2025-04-01",
        "produceId": 1,
        "grade": "A",
        "weight": 25,
        "weightUnit": "kg",
        "pricePerKg": 50000,
        "amount": 1250000
      },
      {
        "date": "2025-04-05",
        "produceId": 1,
        "grade": "B",
        "weight": 15,
        "weightUnit": "kg",
        "pricePerKg": 40000,
        "amount": 600000
      },
      {
        "date": "2025-04-08",
        "produceId": 1,
        "grade": "C",
        "weight": 8,
        "weightUnit": "kg",
        "pricePerKg": 25000,
        "amount": 200000
      }
    ]
  }
];

export default harvests;