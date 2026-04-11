"""
Seed script. Idempotent - safe to run multiple times.

Usage:
    python -m app.seed
"""
from datetime import date, datetime
from sqlalchemy import select, insert
from app.database import SessionLocal, engine, Base
from app.models import (
    User, InventoryItem, Recipe, RecipeIngredient, Task, Setting,
    Sale, StaffWage, task_assignees, Planting, AccountingEntry, ForecastBudget,
    Sop, Video, Supplier,
)
from app.auth import hash_password


KEVIN_VEGETATIVE_INGREDIENTS = [
    ("Calcium Ammonium Nitrate", "A", "MAKRO A", {"1": 145, "5": 725, "25": 3625, "50": 7250}, "CNG Pak Tani, Nutrion Cal"),
    ("KNO3", "A", "MAKRO A", {"1": 50, "5": 250, "25": 1250, "50": 2500}, "KNO3 Tawon"),
    ("FeEDTA", "A", "MIKRO A", {"1": 4, "5": 20, "25": 100, "50": 200}, "BASF"),
    ("K2SO4 (ZK)", "B", "MAKRO B", {"1": 75, "5": 375, "25": 1875, "50": 3750}, "Solupotase"),
    ("KH2PO4 (MKP)", "B", "MAKRO B", {"1": 22, "5": 110, "25": 550, "50": 1100}, "MKP Pak Tani"),
    ("MgSO4", "B", "MAKRO B", {"1": 80, "5": 400, "25": 2000, "50": 4000}, "MgSO4 Pak Tani"),
    ("H3BO3", "B", "MIKRO B", {"1": 0.5, "5": 2.5, "25": 12.5, "50": 25}, "Toko Kimia"),
    ("ZnEDTA", "B", "MIKRO B", {"1": 0.05, "5": 0.25, "25": 1.25, "50": 2.5}, "BASF"),
    ("MnEDTA", "B", "MIKRO B", {"1": 0.7, "5": 3.5, "25": 17.5, "50": 35}, "BASF"),
]


SALES_SEED = [
    ("2026-04-06", 15, "chili_red", "A", 18.5, 85000),
    ("2026-04-06", 15, "chili_red", "B", 12.0, 55000),
    ("2026-04-06", 15, "chili_keriting", "A", 22.3, 72000),
    ("2026-04-07", 15, "melon_yellow", "A", 45.0, 25000),
    ("2026-04-07", 15, "chili_green", "A", 14.8, 65000),
    ("2026-03-30", 14, "chili_red", "A", 16.2, 82000),
    ("2026-03-30", 14, "chili_keriting", "A", 19.5, 70000),
    ("2026-03-31", 14, "melon_yellow", "A", 38.0, 24000),
    ("2026-03-31", 14, "chili_bigred", "B", 11.0, 42000),
    ("2026-03-23", 13, "chili_red", "A", 15.0, 80000),
    ("2026-03-23", 13, "chili_keriting", "A", 17.0, 68000),
    ("2026-03-24", 13, "melon_yellow", "A", 42.0, 23000),
    ("2026-03-16", 12, "chili_red", "A", 14.5, 78000),
    ("2026-03-16", 12, "chili_keriting", "A", 16.5, 66000),
    ("2026-03-17", 12, "melon_yellow", "A", 35.0, 22000),
    ("2026-03-09", 11, "chili_red", "A", 13.0, 76000),
    ("2026-03-09", 11, "chili_keriting", "B", 14.0, 52000),
    ("2026-03-02", 10, "chili_red", "A", 12.0, 75000),
    ("2026-02-23", 9, "chili_red", "A", 11.0, 72000),
    ("2026-02-16", 8, "chili_red", "A", 10.5, 70000),
]


STAFF_SEED = [
    ("Agus Pranoto", "Field lead", 15, "2026-04-06", 48, 18000),
    ("Sri Wahyuni", "Harvester", 15, "2026-04-06", 42, 15000),
    ("Budi Santoso", "Irrigation", 15, "2026-04-06", 40, 16000),
    ("Dewi Lestari", "Packing", 15, "2026-04-06", 36, 14000),
    ("Agus Pranoto", "Field lead", 14, "2026-03-30", 46, 18000),
    ("Sri Wahyuni", "Harvester", 14, "2026-03-30", 40, 15000),
    ("Budi Santoso", "Irrigation", 14, "2026-03-30", 38, 16000),
    ("Agus Pranoto", "Field lead", 13, "2026-03-23", 48, 18000),
    ("Sri Wahyuni", "Harvester", 13, "2026-03-23", 44, 15000),
]


TASKS_SEED = [
    ("Top up nutrient reservoir A", "2026-04-11", "high", "Nutrients", "", False, ["Budi Santoso"]),
    ("Pollinate melon bed 3", "2026-04-11", "high", "Melon", "Morning before 10am", False, ["Sri Wahyuni", "Dewi Lestari"]),
    ("Harvest chilli rows 1-4", "2026-04-12", "medium", "Harvest", "", False, ["Agus Pranoto", "Sri Wahyuni"]),
    ("Pack weekly order for Pasar Segar", "2026-04-13", "high", "Packing", "120kg chilli + 80kg melon", False, ["Dewi Lestari"]),
    ("Check drip lines for leaks", "2026-04-09", "low", "Maintenance", "", True, ["Budi Santoso"]),
    ("Order new rockwool slabs", "2026-04-15", "medium", "Supplies", "", False, ["Boyd Sparrow"]),
]


PLANTINGS_SEED = [
    ("chili_red", "2026-01-15", "2026-04-15", "Rows 1-4", "harvest", "Good yield"),
    ("chili_keriting", "2026-02-01", "2026-05-01", "Rows 5-8", "harvest", ""),
    ("melon_yellow", "2026-02-15", "2026-05-20", "GH bed 1-2", "fruit", "Hand-pollinated"),
    ("chili_green", "2026-03-01", "2026-06-01", "Rows 9-10", "flower", ""),
    ("chili_bigred", "2026-03-15", "2026-06-15", "Rows 11-12", "veg", ""),
    ("melon_rock", "2026-04-01", "2026-07-01", "GH bed 3", "seed", "New trial"),
]


ACCOUNTING_SEED = [
    ("2026-04-05", "expense", "Nutrient AB mix refill", 740000, "Nutrients and fertiliser", "manual"),
    ("2026-04-03", "expense", "Packaging materials", 320000, "Packaging", "manual"),
    ("2026-04-02", "expense", "Electricity bill April", 1850000, "Utilities", "manual"),
]


FORECAST_SEED = [
    ("Seeds and seedlings", 2000000, "2026-04"),
    ("Nutrients and fertiliser", 3000000, "2026-04"),
    ("Staff wages", 12000000, "2026-04"),
    ("Packaging", 1500000, "2026-04"),
    ("Utilities", 2200000, "2026-04"),
    ("Equipment maintenance", 1000000, "2026-04"),
]


SOPS_SEED = [
    {
        "title": "Hydroponic yellow melon pollination",
        "category": "Melon",
        "description": "Hand pollination procedure for yellow melon in the greenhouse between 7am and 10am.",
        "steps": [
            "Identify female flowers (they have a small fruit bulb at the base).",
            "Collect male flowers from the same variety, remove petals.",
            "Gently rub the anther onto the stigma of the female flower.",
            "Tag pollinated flowers with date using coloured ribbon.",
            "Record pollination count in daily log.",
        ],
        "safety_notes": "",
        "frequency": "Daily during flowering",
    },
    {
        "title": "Chilli grading after harvest",
        "category": "Chilli",
        "description": "Quality grading standard for cabai rawit after weighing.",
        "steps": [
            "Grade A: uniform colour, firm, no blemishes, length within spec.",
            "Grade B: minor blemishes acceptable, slight colour variation.",
            "Grade C: soft, blemished, direct to sauce processing.",
            "Weigh each grade separately and record in Sales module.",
        ],
        "safety_notes": "",
        "frequency": "After every harvest",
    },
    {
        "title": "Weekly nutrient mix for hydroponic system",
        "category": "Nutrients",
        "description": "Standard A+B nutrient mixing ratio for chilli and melon lines.",
        "steps": [
            "Check reservoir water level, top up to fill line.",
            "Measure A solution (5ml per litre) and add first.",
            "Stir thoroughly before adding B solution (5ml per litre).",
            "Test EC: target 1.8 to 2.4 mS/cm for chilli, 2.0 to 2.8 for melon.",
            "Test pH: target 5.8 to 6.2. Adjust with pH up/down as needed.",
        ],
        "safety_notes": "Always wear gloves when handling concentrated nutrients. Keep A and B separate until diluted.",
        "frequency": "Weekly",
    },
]


VIDEOS_SEED = [
    ("Greenhouse tour April 2026", "https://www.youtube.com/embed/dQw4w9WgXcQ", "General", "Tour", ""),
    ("Drip irrigation maintenance", "https://www.youtube.com/embed/dQw4w9WgXcQ", "General", "Irrigation", ""),
    ("Yellow melon hand pollination", "https://www.youtube.com/embed/dQw4w9WgXcQ", "Melons", "Flowering", "Best done 7-10am"),
    ("Melon seed germination", "https://www.youtube.com/embed/dQw4w9WgXcQ", "Melons", "Seeding", ""),
    ("Cabai rawit harvest grading", "https://www.youtube.com/embed/dQw4w9WgXcQ", "Chillis", "Harvest", ""),
    ("Chilli seedling transplant", "https://www.youtube.com/embed/dQw4w9WgXcQ", "Chillis", "Seeding", ""),
]


SUPPLIERS_SEED = [
    ("Toko Bibit Jaya", "Bibit Cabai Rawit Merah Unggul (100 biji)",
     "Benih cabai rawit merah F1, daya tumbuh 95 persen, tahan penyakit.",
     35000, 18000, "Seeds",
     "https://images.unsplash.com/photo-1583119022894-919a68a3d0e3?w=400",
     "https://shopee.co.id/bibit-cabai-rawit-merah-unggul",
     "Pengiriman dari Bandung, 2-3 hari."),
    ("Hidroponik Store ID", "Nutrisi AB Mix Hidroponik 5 Liter (mixed)",
     "Larutan pekat A+B siap encer untuk sayuran buah, cocok untuk melon dan cabai.",
     185000, 28000, "Nutrients mixed",
     "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=400",
     "https://tokopedia.com/nutrisi-ab-mix-5l", ""),
    ("Bibit Unggul Nusantara", "Benih Melon Kuning F1 Premium (10 biji)",
     "Benih melon kuning F1, daging tebal manis, cocok untuk hidroponik.",
     12000, 15000, "Seeds",
     "https://images.unsplash.com/photo-1571575173700-afb9492e6a50?w=400",
     "https://tokopedia.com/benih-melon-kuning", ""),
    ("Kimia Tani", "Kalsium Nitrat 1kg (raw)",
     "Pupuk kalsium nitrat murni untuk pencampuran AB Mix sendiri.",
     28000, 22000, "Nutrients raw",
     "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=400",
     "https://tokopedia.com/kalsium-nitrat", ""),
    ("Hidroponik Store ID", "Rockwool Slab Hidroponik 1m",
     "Media tanam rockwool untuk sistem drip dan NFT.",
     95000, 35000, "Rockwool",
     "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400",
     "https://tokopedia.com/rockwool-slab", ""),
    ("Hidroponik Store ID", "Rockwool Cube 2.5cm (100 pcs)",
     "Cube semai rockwool untuk pembibitan.",
     150000, 35000, "Rockwool",
     "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400",
     "https://tokopedia.com/rockwool-cube", ""),
    ("Kimia Tani", "KNO3 Kalium Nitrat 1kg (raw)",
     "Bahan baku KNO3 untuk pencampuran nutrisi AB sendiri.",
     32000, 22000, "Nutrients raw",
     "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=400",
     "https://tokopedia.com/kno3", ""),
]


SHIPPING_ADDRESS_SEED = {
    "name": "Bintang Damanik",
    "phone": "+62 812 6035 8989",
    "address": "Jl. Sangnaualuh No. 123",
    "city": "Pematang Siantar",
    "region": "Sumatera Utara",
    "postcode": "21134",
    "country": "Indonesia",
}


REQUIRED_USERS = [
    {
        "email": "boydsparrow@gmail.com",
        "name": "Boyd Sparrow",
        "password": "changeme",  # Boyd should change immediately
        "role": "superuser",
        "permissions": ["*"],
    },
    {
        "email": "bintangdamanik85@gmail.com",
        "name": "Bintang Damanik",
        "password": "changeme",
        "role": "superuser",
        "permissions": ["*"],
    },
    {
        "email": "sparmanikfarm@gmail.com",
        "name": "Erni Damanik",
        "password": "changeme",
        "role": "admin",
        "permissions": [
            "dashboard", "accounting", "sops", "videos", "suppliers", "forecast",
            "staff", "sales", "tasks", "inventory", "calendar", "weather",
            "recipes", "aichat",
        ],
    },
]


INVENTORY_SEED = [
    ("AB Mix Nutrient A", "Nutrients", 18, "kg", 10, "Nutrient shed", 85000),
    ("AB Mix Nutrient B", "Nutrients", 16, "kg", 10, "Nutrient shed", 85000),
    ("AB Mix Nutrient A (bags)", "Nutrients", 4, "bags", 3, "Nutrient shed", 425000),
    ("AB Mix Nutrient B (bags)", "Nutrients", 3, "bags", 3, "Nutrient shed", 425000),
    ("Calcium Nitrate", "Nutrients", 12, "kg", 5, "Nutrient shed", 28000),
    ("pH Up solution", "Nutrients", 0, "L", 2, "Nutrient shed", 55000),
    ("pH Down solution", "Nutrients", 1.5, "L", 2, "Nutrient shed", 55000),
    ("Rockwool cubes 2.5cm", "Media", 320, "pcs", 200, "Main warehouse", 1500),
    ("Rockwool cubes 4cm", "Media", 180, "pcs", 100, "Main warehouse", 2800),
    ("Rockwool slabs 1m", "Media", 24, "pcs", 20, "Main warehouse", 95000),
    ("Perlite", "Media", 45, "L", 30, "Main warehouse", 18000),
    ("Cocopeat blocks 5kg", "Media", 8, "blocks", 5, "Main warehouse", 65000),
    ("Cocopeat loose", "Media", 32, "kg", 20, "Main warehouse", 8000),
    ("Pots 15cm", "Pots", 120, "pcs", 50, "Main warehouse", 3500),
    ("Pots 20cm", "Pots", 85, "pcs", 40, "Main warehouse", 5500),
    ("Pots 25cm", "Pots", 40, "pcs", 30, "Main warehouse", 8500),
    ("Polybags 20x20", "Pots", 250, "pcs", 200, "Main warehouse", 450),
    ("Polybags 25x25", "Pots", 180, "pcs", 150, "Main warehouse", 650),
    ("Polybags 30x30", "Pots", 90, "pcs", 100, "Main warehouse", 900),
    ("Drippers 2 LPH", "Irrigation", 180, "pcs", 100, "Irrigation shed", 2200),
    ("Drippers 4 LPH", "Irrigation", 95, "pcs", 80, "Irrigation shed", 2500),
    ("Drip connectors (T)", "Irrigation", 140, "pcs", 80, "Irrigation shed", 1800),
    ("Drip connectors (L)", "Irrigation", 80, "pcs", 60, "Irrigation shed", 1800),
    ("Drip connectors (straight)", "Irrigation", 110, "pcs", 60, "Irrigation shed", 1500),
    ("Drip line 16mm", "Irrigation", 120, "m", 100, "Irrigation shed", 8500),
    ("Stake drippers", "Irrigation", 60, "pcs", 50, "Irrigation shed", 3200),
    ("Cabai rawit merah seeds (F1)", "Seeds", 450, "pcs", 200, "Seed room A", 350),
    ("Cabai keriting seeds", "Seeds", 180, "pcs", 200, "Seed room A", 320),
    ("Yellow melon seeds", "Seeds", 85, "pcs", 50, "Seed room A", 1200),
    ("Plastic crates 20L", "Packaging", 45, "pcs", 30, "Packing shed", 45000),
    ("Plastic bags 1kg", "Packaging", 3, "packs", 10, "Packing shed", 25000),
]


KEVIN_GENERATIF_INGREDIENTS = [
    ("Calcium Ammonium Nitrate", "A", "MAKRO A", {"1": 172.28, "5": 861.4, "25": 4307, "50": 8614}, "CNG Pak Tani, Nutrion Cal, Haifa Cal, Yara Calcinit"),
    ("KNO3", "A", "MAKRO A", {"1": 0, "5": 0, "25": 0, "50": 0}, "KNO3 Tawon, KNO3 Hortipray"),
    ("FeEDTA", "A", "MIKRO A", {"1": 5, "5": 25, "25": 125, "50": 250}, "BASF"),
    ("FeEDDHA", "A", "MIKRO A", {"1": 2.658, "5": 13.29, "25": 66.45, "50": 132.9}, "BASF"),
    ("KNO3", "B", "MAKRO B", {"1": 0, "5": 0, "25": 0, "50": 0}, "KNO3 Tawon, KNO3 Hortipray"),
    ("K2SO4 (ZK)", "B", "MAKRO B", {"1": 92.85, "5": 464.25, "25": 2321.25, "50": 4642.5}, "Solupotase, Nutrion SOP"),
    ("KH2PO4 (MKP)", "B", "MAKRO B", {"1": 27.475, "5": 137.375, "25": 686.875, "50": 1373.75}, "MKP Pak Tani"),
    ("MgSO4", "B", "MAKRO B", {"1": 99.42, "5": 497.1, "25": 2485.5, "50": 4971}, "MgSO4 Pak Tani, Haifa MagS"),
    ("ZA", "B", "MAKRO B", {"1": 0, "5": 0, "25": 0, "50": 0}, "ZA Tawon"),
    ("H3BO3", "B", "MIKRO B", {"1": 0.573, "5": 2.863, "25": 14.313, "50": 28.625}, "Toko Kimia atau Toko Online"),
    ("ZnEDTA", "B", "MIKRO B", {"1": 0.067, "5": 0.335, "25": 1.675, "50": 3.35}, "BASF"),
    ("MnEDTA", "B", "MIKRO B", {"1": 0.808, "5": 4.04, "25": 20.2, "50": 40.4}, "BASF"),
    ("CuEDTA", "B", "MIKRO B", {"1": 0.029, "5": 0.145, "25": 0.725, "50": 1.45}, "BASF"),
    ("Na Molibdat", "B", "MIKRO B", {"1": 0.006, "5": 0.028, "25": 0.14, "50": 0.28}, "Toko Kimia atau Toko Online"),
]


def seed():
    db = SessionLocal()
    try:
        # Users
        for u in REQUIRED_USERS:
            existing = db.scalar(select(User).where(User.email == u["email"]))
            if not existing:
                db.add(User(
                    email=u["email"],
                    name=u["name"],
                    password_hash=hash_password(u["password"]),
                    role=u["role"],
                    permissions=u["permissions"],
                    language="en",
                ))
                print(f"  + user {u['email']}")
        db.commit()

        # Inventory
        if db.scalar(select(InventoryItem).limit(1)) is None:
            for name, cat, qty, unit, reorder, loc, cost in INVENTORY_SEED:
                db.add(InventoryItem(
                    name=name, category=cat, quantity=qty, unit=unit,
                    reorder_level=reorder, location=loc, cost_per_unit=cost,
                ))
            db.commit()
            print(f"  + {len(INVENTORY_SEED)} inventory items")

        # Kevin Medan's generative recipe
        existing_recipe = db.scalar(select(Recipe).where(Recipe.name_en == "Melon Generatif (Kevin Medan)"))
        if not existing_recipe:
            r = Recipe(
                name_en="Melon Generatif (Kevin Medan)",
                name_id="Melon Generatif (Kevin Medan)",
                crop_target_en="Yellow melon",
                crop_target_id="Melon kuning",
                stage_en="Generative",
                stage_id="Generatif",
                ec_target=2.4,
                ph_target=6.0,
                concentrates=[1, 5, 25, 50],
                instructions_en=(
                    "Dissolve Group A and Group B in separate tanks. Never mix concentrated "
                    "A and B together as calcium will precipitate with sulfates and phosphates. "
                    "Always add to water, not water to powder. Stir each tank thoroughly until "
                    "fully dissolved before combining at irrigation point."
                ),
                instructions_id=(
                    "Larutkan Grup A dan Grup B di tangki terpisah. Jangan pernah mencampur A "
                    "dan B pekat karena kalsium akan mengendap dengan sulfat dan fosfat. Selalu "
                    "tambahkan ke air, bukan air ke bubuk. Aduk setiap tangki sampai larut "
                    "sempurna sebelum digabungkan di titik irigasi."
                ),
                notes_en="Source: Kevin Medan, April 2026. For mature fruiting stage on yellow melon hydroponic system.",
                notes_id="Sumber: Kevin Medan, April 2026. Untuk tahap pembuahan matang pada sistem hidroponik melon kuning.",
                author="Kevin Medan",
                locked=True,
                version=1,
            )
            db.add(r)
            db.flush()
            for i, (name, group, section, doses, supplier) in enumerate(KEVIN_GENERATIF_INGREDIENTS):
                db.add(RecipeIngredient(
                    recipe_id=r.id, position=i, name=name, group=group,
                    section=section, doses=doses, supplier=supplier,
                ))
            db.commit()
            print(f"  + recipe: Melon Generatif (Kevin Medan) locked")

        # Settings: shipping address
        existing_setting = db.scalar(select(Setting).where(Setting.key == "shipping_address"))
        if not existing_setting:
            db.add(Setting(key="shipping_address", value={
                "name": "Bintang Damanik",
                "phone": "+62 858-1049-6251",
                "address": (
                    "Jalan Asahan Km V, Huta III, Simpang Siongang, Kodim Sionggang, "
                    "Masuk Dalam Cat Warna Kuning Warung Simpang Gg Amanah (Gang Amanah ya bg)"
                ),
                "city": "SIANTAR, KAB. SIMALUNGUN",
                "region": "SUMATERA UTARA",
                "postcode": "21151",
                "country": "ID",
            }))
            db.commit()
            print("  + shipping address")

        # Kevin Medan's vegetative recipe
        existing_veg = db.scalar(select(Recipe).where(Recipe.name_en == "Melon Vegetative (Kevin Medan)"))
        if not existing_veg:
            r = Recipe(
                name_en="Melon Vegetative (Kevin Medan)",
                name_id="Melon Vegetatif (Kevin Medan)",
                crop_target_en="Yellow melon",
                crop_target_id="Melon kuning",
                stage_en="Vegetative",
                stage_id="Vegetatif",
                ec_target=1.8,
                ph_target=5.8,
                concentrates=[1, 5, 25, 50],
                instructions_en="Same A/B separation as the generative recipe. Use during weeks 1-4 after transplant.",
                instructions_id="Pemisahan A/B sama seperti resep generatif. Gunakan pada minggu 1-4 setelah pindah tanam.",
                notes_en="Vegetative stage formula. Lower K and Ca than fruiting stage.",
                notes_id="Formula tahap vegetatif. K dan Ca lebih rendah dari tahap berbuah.",
                author="Kevin Medan",
                locked=False,
                version=1,
            )
            db.add(r)
            db.flush()
            for i, (name, group, section, doses, supplier) in enumerate(KEVIN_VEGETATIVE_INGREDIENTS):
                db.add(RecipeIngredient(
                    recipe_id=r.id, position=i, name=name, group=group,
                    section=section, doses=doses, supplier=supplier,
                ))
            db.commit()
            print("  + recipe: Melon Vegetative (Kevin Medan)")

        # Sales
        if db.scalar(select(Sale).limit(1)) is None:
            for d, week, species, grade, weight, price in SALES_SEED:
                db.add(Sale(
                    date=date.fromisoformat(d),
                    week=week,
                    species=species,
                    grade=grade,
                    weight_kg=weight,
                    price_per_kg=price,
                ))
            db.commit()
            print(f"  + {len(SALES_SEED)} sales entries")

        # Staff wages
        if db.scalar(select(StaffWage).limit(1)) is None:
            for name, role, week, d, hours, rate in STAFF_SEED:
                db.add(StaffWage(
                    name=name,
                    role=role,
                    week=week,
                    date=date.fromisoformat(d),
                    hours=hours,
                    hourly_rate=rate,
                ))
            db.commit()
            print(f"  + {len(STAFF_SEED)} staff wage rows")

        # Tasks with multi-assign
        if db.scalar(select(Task).limit(1)) is None:
            for title, due, priority, category, notes, done, assignees in TASKS_SEED:
                task = Task(
                    title=title,
                    due_date=date.fromisoformat(due),
                    priority=priority,
                    category=category,
                    notes=notes,
                    done=done,
                )
                db.add(task)
                db.flush()
                for name in assignees:
                    db.execute(insert(task_assignees).values(task_id=task.id, assignee_name=name))
            db.commit()
            print(f"  + {len(TASKS_SEED)} tasks with assignees")

        # Plantings
        if db.scalar(select(Planting).limit(1)) is None:
            for variety, planting_d, harvest_d, beds, stage, notes in PLANTINGS_SEED:
                db.add(Planting(
                    variety=variety,
                    planting_date=date.fromisoformat(planting_d),
                    harvest_estimate=date.fromisoformat(harvest_d),
                    beds=beds,
                    stage=stage,
                    notes=notes,
                ))
            db.commit()
            print(f"  + {len(PLANTINGS_SEED)} plantings")

        # Accounting (manual entries only - sync endpoint generates auto entries)
        if db.scalar(select(AccountingEntry).limit(1)) is None:
            for d, type_, desc, amount, category, source in ACCOUNTING_SEED:
                db.add(AccountingEntry(
                    date=date.fromisoformat(d),
                    type=type_,
                    description=desc,
                    amount=amount,
                    category=category,
                    source=source,
                ))
            db.commit()
            print(f"  + {len(ACCOUNTING_SEED)} accounting entries")

        # Forecast budgets
        if db.scalar(select(ForecastBudget).limit(1)) is None:
            for category, budgeted, period in FORECAST_SEED:
                db.add(ForecastBudget(
                    category=category,
                    budgeted=budgeted,
                    period=period,
                ))
            db.commit()
            print(f"  + {len(FORECAST_SEED)} forecast budgets")

        # SOPs
        if db.scalar(select(Sop).limit(1)) is None:
            import re as _re
            for sop_data in SOPS_SEED:
                title_key = _re.sub(r"[^a-z0-9]+", "-", sop_data["title"].lower()).strip("-")
                db.add(Sop(
                    title=sop_data["title"],
                    title_key=title_key,
                    category=sop_data["category"],
                    description=sop_data["description"],
                    steps=sop_data["steps"],
                    safety_notes=sop_data["safety_notes"],
                    frequency=sop_data["frequency"],
                    image_url="",
                    photos=[],
                    version=1,
                    archived=False,
                ))
            db.commit()
            print(f"  + {len(SOPS_SEED)} SOPs")

        # Videos
        if db.scalar(select(Video).limit(1)) is None:
            for title, url, cat, sub, notes in VIDEOS_SEED:
                db.add(Video(title=title, url=url, category=cat, subcategory=sub, notes=notes))
            db.commit()
            print(f"  + {len(VIDEOS_SEED)} videos")

        # Suppliers
        if db.scalar(select(Supplier).limit(1)) is None:
            for name, prod, desc, price, ship, cat, img, src, notes in SUPPLIERS_SEED:
                db.add(Supplier(
                    supplier_name=name,
                    product_name=prod,
                    description=desc,
                    price=price,
                    shipping_cost=ship,
                    total_cost=price + ship,
                    category=cat,
                    image_url=img,
                    source_url=src,
                    notes=notes,
                ))
            db.commit()
            print(f"  + {len(SUPPLIERS_SEED)} suppliers")

        # Shipping address (singleton in settings table)
        existing_addr = db.get(Setting, "shipping_address")
        if not existing_addr:
            db.add(Setting(key="shipping_address", value=SHIPPING_ADDRESS_SEED))
            db.commit()
            print("  + shipping address (Bintang Damanik, Pematang Siantar)")

        print("Seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
