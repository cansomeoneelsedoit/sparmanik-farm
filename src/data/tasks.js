const tasks = [
  {
    "id": 1,
    "title": "Check pH levels all greenhouses",
    "assignee": "Agus Pranoto",
    "dueDate": "2026-04-13",
    "priority": "high",
    "status": "pending",
    "harvestId": 1,
    "notes": "Morning check before 8am",
    "description": "Check and record pH levels in all 5 greenhouses. Target range 5.5-6.5 for melons, 5.8-6.5 for chilis.",
    "instructions": "1. Calibrate pH meter with buffer solution\\n2. Test each greenhouse reservoir\\n3. Record readings in the crop log\\n4. Adjust pH if outside target range\\n5. Report any anomalies to Boyd",
    "comments": [
      {
        "id": 1,
        "author": "Boyd",
        "text": "Make sure to calibrate the pH meter first",
        "date": "2026-04-11",
        "role": "admin"
      },
      {
        "id": 2,
        "author": "Agus Pranoto",
        "text": "Understood, will use buffer 7.0 first",
        "date": "2026-04-11",
        "role": "staff"
      }
    ],
    "photos": []
  },
  {
    "id": 2,
    "title": "Order AB Mix refill",
    "assignee": "Boyd",
    "dueDate": "2026-04-14",
    "priority": "medium",
    "status": "pending",
    "harvestId": null,
    "notes": "Running low, check supplier pricing",
    "description": "",
    "instructions": "",
    "comments": [],
    "photos": []
  },
  {
    "id": 3,
    "title": "Prune melon vines GH Bamboo 1",
    "assignee": "Sri Wahyuni",
    "dueDate": "2026-04-12",
    "priority": "high",
    "status": "in_progress",
    "harvestId": 1,
    "notes": "Focus on lower leaves",
    "description": "Remove lower leaves that are yellowing or showing signs of disease to improve airflow and reduce pest risk.",
    "instructions": "",
    "comments": [
      {
        "id": 1,
        "author": "Boyd",
        "text": "Focus on yellowing lower leaves only, dont touch healthy ones",
        "date": "2026-04-12",
        "role": "admin"
      }
    ],
    "photos": []
  },
  {
    "id": 4,
    "title": "Clean irrigation filters",
    "assignee": "Budi Santoso",
    "dueDate": "2026-04-15",
    "priority": "low",
    "status": "pending",
    "harvestId": null,
    "notes": "Monthly maintenance",
    "description": "",
    "instructions": "",
    "comments": [],
    "photos": []
  },
  {
    "id": 5,
    "title": "Harvest ripe melons",
    "assignee": "Sri Wahyuni",
    "dueDate": "2026-04-12",
    "priority": "high",
    "status": "completed",
    "harvestId": 1,
    "notes": "Grade and weigh each batch",
    "description": "",
    "instructions": "",
    "comments": [],
    "photos": []
  },
  {
    "id": 6,
    "title": "Update crop log spreadsheet",
    "assignee": "Boyd",
    "dueDate": "2026-04-16",
    "priority": "low",
    "status": "pending",
    "harvestId": null,
    "notes": "",
    "description": "",
    "instructions": "",
    "comments": [],
    "photos": []
  },
  {
    "id": 7,
    "title": "Mix nutrient batch for week 16",
    "assignee": "Agus Pranoto",
    "dueDate": "2026-04-13",
    "priority": "medium",
    "status": "pending",
    "harvestId": 1,
    "notes": "EC target 2.0",
    "description": "",
    "instructions": "",
    "comments": [],
    "photos": []
  }
];

export default tasks;