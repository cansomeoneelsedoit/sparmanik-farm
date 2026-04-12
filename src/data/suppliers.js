const suppliers = [
  {
    "id": 1,
    "name": "Tani Metro",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/tanimetro?entryPoint=ShopBySearch&searchKeyword=tani+metro"
  },
  {
    "id": 2,
    "name": "Pink Ponk Pink",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/pinkponkpink?entryPoint=ShopBySearch&searchKeyword=pink+ponk+pink"
  },
  {
    "id": 3,
    "name": "MW Hydro",
    "phone": "",
    "email": "",
    "notes": "Supplied 45 item orders (22 unique products)",
    "shopUrl": "https://shopee.co.id/mwhydro?entryPoint=ShopBySearch&searchKeyword=mw+hydro"
  },
  {
    "id": 4,
    "name": "Tech Titan",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/techtitan?entryPoint=ShopBySearch&searchKeyword=tech+titan"
  },
  {
    "id": 5,
    "name": "OBIT MEKAR LESTARI",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/obitmekarlestari?entryPoint=ShopBySearch&searchKeyword=obit+mekar+lestari"
  },
  {
    "id": 6,
    "name": "Nanda Cell Denpasar",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/nandacelldenpasar?entryPoint=ShopBySearch&searchKeyword=nanda+cell+denpasar"
  },
  {
    "id": 7,
    "name": "Hidroponik.Splendid",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/hidroponiksplendid?entryPoint=ShopBySearch&searchKeyword=hidroponiksplendid"
  },
  {
    "id": 8,
    "name": "Goodthingsinsidedog",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/goodthingsinsidedog?entryPoint=ShopBySearch&searchKeyword=goodthingsinsidedog"
  },
  {
    "id": 9,
    "name": "Glodok123",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/glodok123?entryPoint=ShopBySearch&searchKeyword=glodok123"
  },
  {
    "id": 10,
    "name": "Infarm.id Official Shop",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/infarmidofficialshop?entryPoint=ShopBySearch&searchKeyword=infarmid+official+shop"
  },
  {
    "id": 11,
    "name": "MarineFort",
    "phone": "",
    "email": "",
    "notes": "Supplied 8 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/marinefort?entryPoint=ShopBySearch&searchKeyword=marinefort"
  },
  {
    "id": 12,
    "name": "Pratama Plastik SLG",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/pratamaplastikslg?entryPoint=ShopBySearch&searchKeyword=pratama+plastik+slg"
  },
  {
    "id": 13,
    "name": "Tun Tani",
    "phone": "",
    "email": "",
    "notes": "Supplied 9 item orders (7 unique products)",
    "shopUrl": "https://shopee.co.id/tuntani?entryPoint=ShopBySearch&searchKeyword=tun+tani"
  },
  {
    "id": 14,
    "name": "sahabat tani simalungun",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/sahabattanisimalungun?entryPoint=ShopBySearch&searchKeyword=sahabat+tani+simalungun"
  },
  {
    "id": 15,
    "name": "UD SIMPANG MYANG",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/udsimpangmyang?entryPoint=ShopBySearch&searchKeyword=ud+simpang+myang"
  },
  {
    "id": 16,
    "name": "VIS Cleaning",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/viscleaning?entryPoint=ShopBySearch&searchKeyword=vis+cleaning"
  },
  {
    "id": 17,
    "name": "NUANSA TANI",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/nuansatani?entryPoint=ShopBySearch&searchKeyword=nuansa+tani"
  },
  {
    "id": 18,
    "name": "Dekaki_medan",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/dekaki_medan?entryPoint=ShopBySearch&searchKeyword=dekaki_medan"
  },
  {
    "id": 19,
    "name": "TOKO SUKSES TANI",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/tokosuksestani?entryPoint=ShopBySearch&searchKeyword=toko+sukses+tani"
  },
  {
    "id": 20,
    "name": "Parapat Galeri",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/parapatgaleri?entryPoint=ShopBySearch&searchKeyword=parapat+galeri"
  },
  {
    "id": 21,
    "name": "Kebun Kian",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/kebunkian?entryPoint=ShopBySearch&searchKeyword=kebun+kian"
  },
  {
    "id": 22,
    "name": "sk-cmall",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/skcmall?entryPoint=ShopBySearch&searchKeyword=skcmall"
  },
  {
    "id": 23,
    "name": "toko taman.",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/tokotaman?entryPoint=ShopBySearch&searchKeyword=toko+taman"
  },
  {
    "id": 24,
    "name": "Toko Grosir Medan Store",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/tokogrosirmedanstore?entryPoint=ShopBySearch&searchKeyword=toko+grosir+medan+store"
  },
  {
    "id": 25,
    "name": "rumah ardy",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/rumahardy?entryPoint=ShopBySearch&searchKeyword=rumah+ardy"
  },
  {
    "id": 26,
    "name": "colour.seeds",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/colourseeds?entryPoint=ShopBySearch&searchKeyword=colourseeds"
  },
  {
    "id": 27,
    "name": "bagusmart2",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/bagusmart2?entryPoint=ShopBySearch&searchKeyword=bagusmart2"
  },
  {
    "id": 28,
    "name": "Glodok Supermarket",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/glodoksupermarket?entryPoint=ShopBySearch&searchKeyword=glodok+supermarket"
  },
  {
    "id": 29,
    "name": "zbtlink 4g/5g router",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/zbtlink4g5grouter?entryPoint=ShopBySearch&searchKeyword=zbtlink+4g5g+router"
  },
  {
    "id": 30,
    "name": "Surya Plastik Official",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/suryaplastikofficial?entryPoint=ShopBySearch&searchKeyword=surya+plastik+official"
  },
  {
    "id": 31,
    "name": "iseedyou",
    "phone": "",
    "email": "",
    "notes": "Supplied 1 item orders (1 unique products)",
    "shopUrl": "https://shopee.co.id/iseedyou?entryPoint=ShopBySearch&searchKeyword=iseedyou"
  },
  {
    "id": 32,
    "name": "Bahagia Plastik88",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/bahagiaplastik88?entryPoint=ShopBySearch&searchKeyword=bahagia+plastik88"
  },
  {
    "id": 33,
    "name": "BJB Fishing Shop",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/bjbfishingshop?entryPoint=ShopBySearch&searchKeyword=bjb+fishing+shop"
  },
  {
    "id": 34,
    "name": "bracketmonitortv",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/bracketmonitortv?entryPoint=ShopBySearch&searchKeyword=bracketmonitortv"
  },
  {
    "id": 35,
    "name": "D.R.C",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/drc?entryPoint=ShopBySearch&searchKeyword=drc"
  },
  {
    "id": 36,
    "name": "CV AGRO INTI",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/cvagrointi?entryPoint=ShopBySearch&searchKeyword=cv+agro+inti"
  },
  {
    "id": 37,
    "name": "BenihBerkahjakarta",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/benihberkahjakarta?entryPoint=ShopBySearch&searchKeyword=benihberkahjakarta"
  },
  {
    "id": 38,
    "name": "Gracieshop",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/gracieshop?entryPoint=ShopBySearch&searchKeyword=gracieshop"
  },
  {
    "id": 39,
    "name": "anghoktiam",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/anghoktiam?entryPoint=ShopBySearch&searchKeyword=anghoktiam"
  },
  {
    "id": 40,
    "name": "Sentosamakmurtechnical",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/sentosamakmurtechnical?entryPoint=ShopBySearch&searchKeyword=sentosamakmurtechnical"
  },
  {
    "id": 41,
    "name": "F9 Farm",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/f9farm?entryPoint=ShopBySearch&searchKeyword=f9+farm"
  },
  {
    "id": 42,
    "name": "Hendri_yannishop",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/hendri_yannishop?entryPoint=ShopBySearch&searchKeyword=hendri_yannishop"
  },
  {
    "id": 43,
    "name": "artani shop",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/artanishop?entryPoint=ShopBySearch&searchKeyword=artani+shop"
  },
  {
    "id": 44,
    "name": "Royal Canin Official Shop",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/royalcaninofficialshop?entryPoint=ShopBySearch&searchKeyword=royal+canin+official+shop"
  },
  {
    "id": 45,
    "name": "Belva Aquatic",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/belvaaquatic?entryPoint=ShopBySearch&searchKeyword=belva+aquatic"
  },
  {
    "id": 46,
    "name": "Johrnia Farm",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/johrniafarm?entryPoint=ShopBySearch&searchKeyword=johrnia+farm"
  },
  {
    "id": 47,
    "name": "Rosebunga1990",
    "phone": "",
    "email": "",
    "notes": "Supplied 7 item orders (6 unique products)",
    "shopUrl": "https://shopee.co.id/rosebunga1990?entryPoint=ShopBySearch&searchKeyword=rosebunga1990"
  },
  {
    "id": 48,
    "name": "Natalo Petshop & Aquarium",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/natalopetshopaquarium?entryPoint=ShopBySearch&searchKeyword=natalo+petshop+aquarium"
  },
  {
    "id": 49,
    "name": "OBAT PERTANIAN DAN PU…",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/obatpertaniandanpu?entryPoint=ShopBySearch&searchKeyword=obat+pertanian+dan+pu"
  },
  {
    "id": 50,
    "name": "Langit Luas id",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/langitluasid?entryPoint=ShopBySearch&searchKeyword=langit+luas+id"
  },
  {
    "id": 51,
    "name": "Rooftop Garden",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/rooftopgarden?entryPoint=ShopBySearch&searchKeyword=rooftop+garden"
  },
  {
    "id": 52,
    "name": "nftshop",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/nftshop?entryPoint=ShopBySearch&searchKeyword=nftshop"
  },
  {
    "id": 53,
    "name": "Bakery Goodies",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/bakerygoodies?entryPoint=ShopBySearch&searchKeyword=bakery+goodies"
  },
  {
    "id": 54,
    "name": "UD. KAKA FARM",
    "phone": "",
    "email": "",
    "notes": "Supplied 7 item orders (6 unique products)",
    "shopUrl": "https://shopee.co.id/udkakafarm?entryPoint=ShopBySearch&searchKeyword=ud+kaka+farm"
  },
  {
    "id": 55,
    "name": "Disney Audio Official Store",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/disneyaudioofficialstore?entryPoint=ShopBySearch&searchKeyword=disney+audio+official+store"
  },
  {
    "id": 56,
    "name": "Citylish",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/citylish?entryPoint=ShopBySearch&searchKeyword=citylish"
  },
  {
    "id": 57,
    "name": "Puriegarden",
    "phone": "",
    "email": "",
    "notes": "Supplied 8 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/puriegarden?entryPoint=ShopBySearch&searchKeyword=puriegarden"
  },
  {
    "id": 58,
    "name": "Loegueshop",
    "phone": "",
    "email": "",
    "notes": "Supplied 7 item orders (4 unique products)",
    "shopUrl": "https://shopee.co.id/loegueshop?entryPoint=ShopBySearch&searchKeyword=loegueshop"
  },
  {
    "id": 59,
    "name": "dsallam",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/dsallam?entryPoint=ShopBySearch&searchKeyword=dsallam"
  },
  {
    "id": 60,
    "name": "CitrusHill Toko Tani Masa Kini",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/citrushilltokotanimasakini?entryPoint=ShopBySearch&searchKeyword=citrushill+toko+tani+masa+kini"
  },
  {
    "id": 61,
    "name": "Damai Shop",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/damaishop?entryPoint=ShopBySearch&searchKeyword=damai+shop"
  },
  {
    "id": 62,
    "name": "B&W G Store",
    "phone": "",
    "email": "",
    "notes": "Supplied 6 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/bwgstore?entryPoint=ShopBySearch&searchKeyword=bw+g+store"
  },
  {
    "id": 63,
    "name": "kandangtentremlestari",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/kandangtentremlestari?entryPoint=ShopBySearch&searchKeyword=kandangtentremlestari"
  },
  {
    "id": 64,
    "name": "Kimia industri",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/kimiaindustri?entryPoint=ShopBySearch&searchKeyword=kimia+industri"
  },
  {
    "id": 65,
    "name": "Mitra Sejati Stationery",
    "phone": "",
    "email": "",
    "notes": "Supplied 6 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/mitrasejatistationery?entryPoint=ShopBySearch&searchKeyword=mitra+sejati+stationery"
  },
  {
    "id": 66,
    "name": "Fishco Aquatic Official Store",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/fishcoaquaticofficialstore?entryPoint=ShopBySearch&searchKeyword=fishco+aquatic+official+store"
  },
  {
    "id": 67,
    "name": "neo geo shop",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/neogeoshop?entryPoint=ShopBySearch&searchKeyword=neo+geo+shop"
  },
  {
    "id": 68,
    "name": "Kalang Kabut Kimia",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/kalangkabutkimia?entryPoint=ShopBySearch&searchKeyword=kalang+kabut+kimia"
  },
  {
    "id": 69,
    "name": "pabrikplastik24",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/pabrikplastik24?entryPoint=ShopBySearch&searchKeyword=pabrikplastik24"
  },
  {
    "id": 70,
    "name": "Raja Kimia",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/rajakimia?entryPoint=ShopBySearch&searchKeyword=raja+kimia"
  },
  {
    "id": 71,
    "name": "Utama Machinery",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/utamamachinery?entryPoint=ShopBySearch&searchKeyword=utama+machinery"
  },
  {
    "id": 72,
    "name": "URBANFARM",
    "phone": "",
    "email": "",
    "notes": "Supplied 7 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/urbanfarm?entryPoint=ShopBySearch&searchKeyword=urbanfarm"
  },
  {
    "id": 73,
    "name": "Bibit Bunga",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/bibitbunga?entryPoint=ShopBySearch&searchKeyword=bibit+bunga"
  },
  {
    "id": 74,
    "name": "ELANG MANDIRI TANI",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/elangmandiritani?entryPoint=ShopBySearch&searchKeyword=elang+mandiri+tani"
  },
  {
    "id": 75,
    "name": "Samsung Exclusive Official…",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/samsungexclusiveofficial?entryPoint=ShopBySearch&searchKeyword=samsung+exclusive+official"
  },
  {
    "id": 76,
    "name": "Amefurashi Official Shop",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/amefurashiofficialshop?entryPoint=ShopBySearch&searchKeyword=amefurashi+official+shop"
  },
  {
    "id": 77,
    "name": "pasarminggu",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/pasarminggu?entryPoint=ShopBySearch&searchKeyword=pasarminggu"
  },
  {
    "id": 78,
    "name": "PLASTIK PERTANIAN STORE",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/plastikpertanianstore?entryPoint=ShopBySearch&searchKeyword=plastik+pertanian+store"
  },
  {
    "id": 79,
    "name": "Ragam Lapak",
    "phone": "",
    "email": "",
    "notes": "Supplied 6 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/ragamlapak?entryPoint=ShopBySearch&searchKeyword=ragam+lapak"
  },
  {
    "id": 80,
    "name": "Subur Kimia Jaya",
    "phone": "",
    "email": "",
    "notes": "Supplied 6 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/suburkimiajaya?entryPoint=ShopBySearch&searchKeyword=subur+kimia+jaya"
  },
  {
    "id": 81,
    "name": "bosaquatic",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/bosaquatic?entryPoint=ShopBySearch&searchKeyword=bosaquatic"
  },
  {
    "id": 82,
    "name": "sejatifarm",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/sejatifarm?entryPoint=ShopBySearch&searchKeyword=sejatifarm"
  },
  {
    "id": 83,
    "name": "Pusatfurniture.jkt",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/pusatfurniturejkt?entryPoint=ShopBySearch&searchKeyword=pusatfurniturejkt"
  },
  {
    "id": 84,
    "name": "Hoki Jaya Shop Indonesia",
    "phone": "",
    "email": "",
    "notes": "Supplied 7 item orders (6 unique products)",
    "shopUrl": "https://shopee.co.id/hokijayashopindonesia?entryPoint=ShopBySearch&searchKeyword=hoki+jaya+shop+indonesia"
  },
  {
    "id": 85,
    "name": "LLJ",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/llj?entryPoint=ShopBySearch&searchKeyword=llj"
  },
  {
    "id": 86,
    "name": "L&Ostore",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (4 unique products)",
    "shopUrl": "https://shopee.co.id/lostore?entryPoint=ShopBySearch&searchKeyword=lostore"
  },
  {
    "id": 87,
    "name": "F&N shop85",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/fnshop85?entryPoint=ShopBySearch&searchKeyword=fn+shop85"
  },
  {
    "id": 88,
    "name": "netpot malang",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/netpotmalang?entryPoint=ShopBySearch&searchKeyword=netpot+malang"
  },
  {
    "id": 89,
    "name": "R aquatic",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/raquatic?entryPoint=ShopBySearch&searchKeyword=r+aquatic"
  },
  {
    "id": 90,
    "name": "agen dropseeder",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/agendropseeder?entryPoint=ShopBySearch&searchKeyword=agen+dropseeder"
  },
  {
    "id": 91,
    "name": "moremoremoremore",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/moremoremoremore?entryPoint=ShopBySearch&searchKeyword=moremoremoremore"
  },
  {
    "id": 92,
    "name": "handylife9",
    "phone": "",
    "email": "",
    "notes": "Supplied 16 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/handylife9?entryPoint=ShopBySearch&searchKeyword=handylife9"
  },
  {
    "id": 93,
    "name": "Marsada Hidroponik",
    "phone": "",
    "email": "",
    "notes": "Supplied 6 item orders (5 unique products)",
    "shopUrl": "https://shopee.co.id/marsadahidroponik?entryPoint=ShopBySearch&searchKeyword=marsada+hidroponik"
  },
  {
    "id": 94,
    "name": "lim_betta",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/lim_betta?entryPoint=ShopBySearch&searchKeyword=lim_betta"
  },
  {
    "id": 95,
    "name": "Jirifarm Hidroponik",
    "phone": "",
    "email": "",
    "notes": "Supplied 14 item orders (7 unique products)",
    "shopUrl": "https://shopee.co.id/jirifarmhidroponik?entryPoint=ShopBySearch&searchKeyword=jirifarm+hidroponik"
  },
  {
    "id": 96,
    "name": "Byotani Indonesia",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/byotaniindonesia?entryPoint=ShopBySearch&searchKeyword=byotani+indonesia"
  },
  {
    "id": 97,
    "name": "Tb. Lancar Bersama",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/tblancarbersama?entryPoint=ShopBySearch&searchKeyword=tb+lancar+bersama"
  },
  {
    "id": 98,
    "name": "Dismas Zeno",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/dismaszeno?entryPoint=ShopBySearch&searchKeyword=dismas+zeno"
  },
  {
    "id": 99,
    "name": "MW Hydro Tangerang",
    "phone": "",
    "email": "",
    "notes": "Supplied 12 item orders (5 unique products)",
    "shopUrl": "https://shopee.co.id/mwhydrotangerang?entryPoint=ShopBySearch&searchKeyword=mw+hydro+tangerang"
  },
  {
    "id": 100,
    "name": "3D Zaiku Indonesia",
    "phone": "",
    "email": "",
    "notes": "Supplied 7 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/3dzaikuindonesia?entryPoint=ShopBySearch&searchKeyword=3d+zaiku+indonesia"
  },
  {
    "id": 101,
    "name": "Toko Bangunan Samudra A…",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/tokobangunansamudraa?entryPoint=ShopBySearch&searchKeyword=toko+bangunan+samudra+a"
  },
  {
    "id": 102,
    "name": "Workplant Official Store",
    "phone": "",
    "email": "",
    "notes": "Supplied 10 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/workplantofficialstore?entryPoint=ShopBySearch&searchKeyword=workplant+official+store"
  },
  {
    "id": 103,
    "name": "Kebun_amira",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/kebun_amira?entryPoint=ShopBySearch&searchKeyword=kebun_amira"
  },
  {
    "id": 104,
    "name": "tokooreyo",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/tokooreyo?entryPoint=ShopBySearch&searchKeyword=tokooreyo"
  },
  {
    "id": 105,
    "name": "DKO STORE",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/dkostore?entryPoint=ShopBySearch&searchKeyword=dko+store"
  },
  {
    "id": 106,
    "name": "Ember Ikan Cupang",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/emberikancupang?entryPoint=ShopBySearch&searchKeyword=ember+ikan+cupang"
  },
  {
    "id": 107,
    "name": "Toko Ember Es Krim Jakpus",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/tokoembereskrimjakpus?entryPoint=ShopBySearch&searchKeyword=toko+ember+es+krim+jakpus"
  },
  {
    "id": 108,
    "name": "relaniesshop",
    "phone": "",
    "email": "",
    "notes": "Supplied 8 item orders (5 unique products)",
    "shopUrl": "https://shopee.co.id/relaniesshop?entryPoint=ShopBySearch&searchKeyword=relaniesshop"
  },
  {
    "id": 109,
    "name": "jimshop88",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/jimshop88?entryPoint=ShopBySearch&searchKeyword=jimshop88"
  },
  {
    "id": 110,
    "name": "TRIDYSTORE.OFFICIAL",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/tridystoreofficial?entryPoint=ShopBySearch&searchKeyword=tridystoreofficial"
  },
  {
    "id": 111,
    "name": "CyberLive",
    "phone": "",
    "email": "",
    "notes": "Supplied 10 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/cyberlive?entryPoint=ShopBySearch&searchKeyword=cyberlive"
  },
  {
    "id": 112,
    "name": "Motomobil",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/motomobil?entryPoint=ShopBySearch&searchKeyword=motomobil"
  },
  {
    "id": 113,
    "name": "RajaPlumbing",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (4 unique products)",
    "shopUrl": "https://shopee.co.id/rajaplumbing?entryPoint=ShopBySearch&searchKeyword=rajaplumbing"
  },
  {
    "id": 114,
    "name": "Permata Anugerah Chemistry",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/permataanugerahchemistry?entryPoint=ShopBySearch&searchKeyword=permata+anugerah+chemistry"
  },
  {
    "id": 115,
    "name": "BELI BANGUN",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/belibangun?entryPoint=ShopBySearch&searchKeyword=beli+bangun"
  },
  {
    "id": 116,
    "name": "HIDROPEDIA Hidroponik S…",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/hidropediahidroponiks?entryPoint=ShopBySearch&searchKeyword=hidropedia+hidroponik+s"
  },
  {
    "id": 117,
    "name": "Kolumb Outdoor Official St…",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/kolumboutdoorofficialst?entryPoint=ShopBySearch&searchKeyword=kolumb+outdoor+official+st"
  },
  {
    "id": 118,
    "name": "TERRAZIN Medan",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/terrazinmedan?entryPoint=ShopBySearch&searchKeyword=terrazin+medan"
  },
  {
    "id": 119,
    "name": "Nutri House",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/nutrihouse?entryPoint=ShopBySearch&searchKeyword=nutri+house"
  },
  {
    "id": 120,
    "name": "SedoyoFarm",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/sedoyofarm?entryPoint=ShopBySearch&searchKeyword=sedoyofarm"
  },
  {
    "id": 121,
    "name": "UthieOrchard",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/uthieorchard?entryPoint=ShopBySearch&searchKeyword=uthieorchard"
  },
  {
    "id": 122,
    "name": "Lastore_7",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/lastore_7?entryPoint=ShopBySearch&searchKeyword=lastore_7"
  },
  {
    "id": 123,
    "name": "Luwes tani",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/luwestani?entryPoint=ShopBySearch&searchKeyword=luwes+tani"
  },
  {
    "id": 124,
    "name": "hydro_sajoer",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/hydro_sajoer?entryPoint=ShopBySearch&searchKeyword=hydro_sajoer"
  },
  {
    "id": 125,
    "name": "GreenFarm.ID",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/greenfarmid?entryPoint=ShopBySearch&searchKeyword=greenfarmid"
  },
  {
    "id": 126,
    "name": "DL Medan Hidroponik",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/dlmedanhidroponik?entryPoint=ShopBySearch&searchKeyword=dl+medan+hidroponik"
  },
  {
    "id": 127,
    "name": "Netafarm_Hydroproduk",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/netafarm_hydroproduk?entryPoint=ShopBySearch&searchKeyword=netafarm_hydroproduk"
  },
  {
    "id": 128,
    "name": "RUMINESIA",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/ruminesia?entryPoint=ShopBySearch&searchKeyword=ruminesia"
  },
  {
    "id": 129,
    "name": "GreenHouse Indonesia",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/greenhouseindonesia?entryPoint=ShopBySearch&searchKeyword=greenhouse+indonesia"
  },
  {
    "id": 130,
    "name": "Minigarden Indonesia ( MGI )",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/minigardenindonesiamgi?entryPoint=ShopBySearch&searchKeyword=minigarden+indonesia+mgi"
  },
  {
    "id": 131,
    "name": "Rumah PintarMax",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/rumahpintarmax?entryPoint=ShopBySearch&searchKeyword=rumah+pintarmax"
  },
  {
    "id": 132,
    "name": "YW Online Store",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/ywonlinestore?entryPoint=ShopBySearch&searchKeyword=yw+online+store"
  },
  {
    "id": 133,
    "name": "L^A CULTURE",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/laculture?entryPoint=ShopBySearch&searchKeyword=la+culture"
  },
  {
    "id": 134,
    "name": "Benih Seribuan Semarang",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/benihseribuansemarang?entryPoint=ShopBySearch&searchKeyword=benih+seribuan+semarang"
  },
  {
    "id": 135,
    "name": "Pertamajayashop",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/pertamajayashop?entryPoint=ShopBySearch&searchKeyword=pertamajayashop"
  },
  {
    "id": 136,
    "name": "Sindo Seal",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/sindoseal?entryPoint=ShopBySearch&searchKeyword=sindo+seal"
  },
  {
    "id": 137,
    "name": "duta teknik 98",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/dutateknik98?entryPoint=ShopBySearch&searchKeyword=duta+teknik+98"
  },
  {
    "id": 138,
    "name": "TMjawarabibit",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/tmjawarabibit?entryPoint=ShopBySearch&searchKeyword=tmjawarabibit"
  },
  {
    "id": 139,
    "name": "medan pipe fittings",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/medanpipefittings?entryPoint=ShopBySearch&searchKeyword=medan+pipe+fittings"
  },
  {
    "id": 140,
    "name": "Pipa Kita",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/pipakita?entryPoint=ShopBySearch&searchKeyword=pipa+kita"
  },
  {
    "id": 141,
    "name": "yunida scape",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/yunidascape?entryPoint=ShopBySearch&searchKeyword=yunida+scape"
  },
  {
    "id": 142,
    "name": "LAKUDOME",
    "phone": "",
    "email": "",
    "notes": "Supplied 6 item orders (3 unique products)",
    "shopUrl": "https://shopee.co.id/lakudome?entryPoint=ShopBySearch&searchKeyword=lakudome"
  },
  {
    "id": 143,
    "name": "BERKEBUNDIRUMAH",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/berkebundirumah?entryPoint=ShopBySearch&searchKeyword=berkebundirumah"
  },
  {
    "id": 144,
    "name": "PetTani",
    "phone": "",
    "email": "",
    "notes": "Supplied 11 item orders (11 unique products)",
    "shopUrl": "https://shopee.co.id/pettani?entryPoint=ShopBySearch&searchKeyword=pettani"
  },
  {
    "id": 145,
    "name": "Willman Olshop",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/willmanolshop?entryPoint=ShopBySearch&searchKeyword=willman+olshop"
  },
  {
    "id": 146,
    "name": "BISNIS SEJAHTERA",
    "phone": "",
    "email": "",
    "notes": "Supplied 8 item orders (7 unique products)",
    "shopUrl": "https://shopee.co.id/bisnissejahtera?entryPoint=ShopBySearch&searchKeyword=bisnis+sejahtera"
  },
  {
    "id": 147,
    "name": "BIBIT MAKMUR",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/bibitmakmur?entryPoint=ShopBySearch&searchKeyword=bibit+makmur"
  },
  {
    "id": 148,
    "name": "Hidrogel pelangi",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/hidrogelpelangi?entryPoint=ShopBySearch&searchKeyword=hidrogel+pelangi"
  },
  {
    "id": 149,
    "name": "twinscreativeproduct",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/twinscreativeproduct?entryPoint=ShopBySearch&searchKeyword=twinscreativeproduct"
  },
  {
    "id": 150,
    "name": "United Koi Bali",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/unitedkoibali?entryPoint=ShopBySearch&searchKeyword=united+koi+bali"
  },
  {
    "id": 151,
    "name": "Murahpedia",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/murahpedia?entryPoint=ShopBySearch&searchKeyword=murahpedia"
  },
  {
    "id": 152,
    "name": "Denggan Pratama",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/dengganpratama?entryPoint=ShopBySearch&searchKeyword=denggan+pratama"
  },
  {
    "id": 153,
    "name": "Pi Toserba",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/pitoserba?entryPoint=ShopBySearch&searchKeyword=pi+toserba"
  },
  {
    "id": 154,
    "name": "Hidroponik Purwakarta",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/hidroponikpurwakarta?entryPoint=ShopBySearch&searchKeyword=hidroponik+purwakarta"
  },
  {
    "id": 155,
    "name": "Clarista Farm",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (4 unique products)",
    "shopUrl": "https://shopee.co.id/claristafarm?entryPoint=ShopBySearch&searchKeyword=clarista+farm"
  },
  {
    "id": 156,
    "name": "visaquatic",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/visaquatic?entryPoint=ShopBySearch&searchKeyword=visaquatic"
  },
  {
    "id": 157,
    "name": "COOFARI",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/coofari?entryPoint=ShopBySearch&searchKeyword=coofari"
  },
  {
    "id": 158,
    "name": "aleshaam",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/aleshaam?entryPoint=ShopBySearch&searchKeyword=aleshaam"
  },
  {
    "id": 159,
    "name": "plastikku.id",
    "phone": "",
    "email": "",
    "notes": "Supplied 3 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/plastikkuid?entryPoint=ShopBySearch&searchKeyword=plastikkuid"
  },
  {
    "id": 160,
    "name": "MCASTORE.ID",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/mcastoreid?entryPoint=ShopBySearch&searchKeyword=mcastoreid"
  },
  {
    "id": 161,
    "name": "iserba",
    "phone": "",
    "email": "",
    "notes": "Supplied 5 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/iserba?entryPoint=ShopBySearch&searchKeyword=iserba"
  },
  {
    "id": 162,
    "name": "Zagita Hydro Farm",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/zagitahydrofarm?entryPoint=ShopBySearch&searchKeyword=zagita+hydro+farm"
  },
  {
    "id": 163,
    "name": "Ta-nah Store",
    "phone": "",
    "email": "",
    "notes": "Supplied 4 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/tanahstore?entryPoint=ShopBySearch&searchKeyword=tanah+store"
  },
  {
    "id": 164,
    "name": "rr.ridwanriyanto",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/rrridwanriyanto?entryPoint=ShopBySearch&searchKeyword=rrridwanriyanto"
  },
  {
    "id": 165,
    "name": "YORU PREDATOR FISH",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/yorupredatorfish?entryPoint=ShopBySearch&searchKeyword=yoru+predator+fish"
  },
  {
    "id": 166,
    "name": "Akim Warehouse",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/akimwarehouse?entryPoint=ShopBySearch&searchKeyword=akim+warehouse"
  },
  {
    "id": 167,
    "name": "Anak Pohon",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/anakpohon?entryPoint=ShopBySearch&searchKeyword=anak+pohon"
  },
  {
    "id": 168,
    "name": "UKI BIBIT",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/ukibibit?entryPoint=ShopBySearch&searchKeyword=uki+bibit"
  },
  {
    "id": 169,
    "name": "ernayunarti78",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/ernayunarti78?entryPoint=ShopBySearch&searchKeyword=ernayunarti78"
  },
  {
    "id": 170,
    "name": "Pi Digital Medan",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/pidigitalmedan?entryPoint=ShopBySearch&searchKeyword=pi+digital+medan"
  },
  {
    "id": 171,
    "name": "sunstar shop",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/sunstarshop?entryPoint=ShopBySearch&searchKeyword=sunstar+shop"
  },
  {
    "id": 172,
    "name": "Green Garden Agriculture",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/greengardenagriculture?entryPoint=ShopBySearch&searchKeyword=green+garden+agriculture"
  },
  {
    "id": 173,
    "name": "Pets N Plants ID",
    "phone": "",
    "email": "",
    "notes": "Supplied 2 item orders (2 unique products)",
    "shopUrl": "https://shopee.co.id/petsnplantsid?entryPoint=ShopBySearch&searchKeyword=pets+n+plants+id"
  },
  {
    "id": 174,
    "name": "kopitrading.shop",
    "phone": "",
    "email": "",
    "notes": "Supplied 16 item orders (16 unique products)",
    "shopUrl": "https://shopee.co.id/kopitradingshop?entryPoint=ShopBySearch&searchKeyword=kopitradingshop"
  }
];

export default suppliers;
