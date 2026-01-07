const tg = window.Telegram.WebApp;
tg.expand();
const urlParams = new URLSearchParams(window.location.search);

// ====================================================================
// 🚨 MUHIM: BOTINGIZNING USERNAMESINI SHU YERGA YOZING (Kuchukchasiz)
// Masalan: const BOT_USERNAME = "FermerBoyBot";
const BOT_USERNAME = "BotingizUsernamesiniYozing"; 
// ====================================================================

// SOZLAMALAR
const CONFIG = {
    chicken: { time: 3, food: 1, name: "TOVUQXONA", levelReq: 1, xpReward: 10 },
    sheep:   { time: 5, food: 2, name: "QO'YXONA", levelReq: 3, xpReward: 20 },
    cow:     { time: 8, food: 3, name: "MOLXONA", levelReq: 5, xpReward: 50 }
};

// O'YIN HOLATI (URL dan o'qiladi)
let game = {
    balance: parseInt(urlParams.get('b')) || 10,
    food: parseInt(urlParams.get('f')) || 5,
    inventory: parseInventory(urlParams.get('i')),
    warehouse: parseWarehouse(urlParams.get('w')),
    level: parseInt(urlParams.get('l')) || 1, 
    xp: parseInt(urlParams.get('x')) || 0,
    marketData: parseMarketData(urlParams.get('m'))
};

let animalTimers = [];
let currentView = 'map'; 

// ================== TO'LOV TIZIMI (DEEP LINK) ==================
// Bu usul Web Appni yopadi va botga start komandasini yuboradi.
// Bot esa darhol to'lov chekini chiqarib beradi. 100% Ishlaydi.

function buySpecialOffer() {
    tg.openTelegramLink(`https://t.me/${BOT_USERNAME}?start=buy_special_offer`);
    tg.close();
}

function buyRealMoney() {
    tg.openTelegramLink(`https://t.me/${BOT_USERNAME}?start=buy_stars_pack`);
    tg.close();
}

// ================== AKSIYA VA MODALLAR ==================
function openSpecialOffer() {
    document.getElementById("special-offer-modal").style.display = "flex";
}

function closeSpecialOffer() {
    document.getElementById("special-offer-modal").style.display = "none";
}

// O'yinga kirganda avtomatik taklif (Agar level kichik bo'lsa)
setTimeout(() => {
    if (game.level < 5) {
        openSpecialOffer();
    }
}, 1500);

function openShop() { document.getElementById("shop-modal").style.display = "block"; }
function closeShop() { document.getElementById("shop-modal").style.display = "none"; }

// ================== PARSING (MA'LUMOTLARNI O'QISH) ==================
function parseInventory(str) {
    if (!str) return {};
    let inv = {};
    str.split(',').forEach(item => { if(item.includes(':')) { let [k,v]=item.split(':'); inv[k]=parseInt(v); } });
    return inv;
}

function parseWarehouse(str) {
    let wh = {eggs: 0, wool: 0, meat: 0};
    if (!str) return wh;
    str.split(',').forEach(p => { 
        if(p.includes(':')) { 
            let [k,v]=p.split(':'); 
            let key = (k=='E')?'eggs':(k=='W'?'wool':'meat');
            wh[key]=parseInt(v); 
        }
    });
    return wh;
}

function parseMarketData(str) {
    if (!str) return [];
    return str.split('|').map(item => {
        let p = item.split(':');
        if(p.length < 5) return null;
        return { id: p[0], seller: p[1], type: p[2], qty: p[3], price: p[4] };
    }).filter(item => item !== null);
}

// ================== BOZOR LOGIKASI ==================
function showMarket() {
    currentView = 'market';
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById('market-view').style.display = 'block';
    renderMarketList();
    updateUI();
}

function renderMarketList() {
    const list = document.getElementById('market-list');
    list.innerHTML = "";
    
    if (game.marketData.length === 0) {
        list.innerHTML = "<p style='text-align:center; color:#ddd; padding: 20px;'>Bozor bo'sh...</p>";
        return;
    }

    game.marketData.forEach(item => {
        let div = document.createElement('div');
        div.className = 'market-item';
        let emoji = (item.type=='eggs')?'🥚':(item.type=='wool'?'🧶':'🥩');
        
        div.innerHTML = `
            <div class="m-info">
                <span style="font-size:12px; color:#555;">Sotuvchi: <b>${item.seller}</b></span><br>
                <span style="font-size:16px;">${emoji} <b>${item.qty}</b> dona</span>
            </div>
            <div style="text-align:right;">
                <div class="m-price">${item.price} FAM</div>
                <button class="btn-buy-market" onclick="buyFromMarket(${item.id})">OLISH</button>
            </div>
        `;
        list.appendChild(div);
    });
}

function sellToMarket() {
    let item = document.getElementById("sell-item").value;
    let qty = parseInt(document.getElementById("sell-qty").value);
    let price = parseInt(document.getElementById("sell-price").value);

    if (!qty || qty <= 0) { tg.showAlert("Sonini kiriting!"); return; }
    if (!price || price <= 0) { tg.showAlert("Narxni kiriting!"); return; }
    
    // Omborda bormi?
    if ((game.warehouse[item] || 0) < qty) { 
        tg.showAlert("Sizda yetarlicha mahsulot yo'q!"); 
        return; 
    }

    // Bozorda sotish uchun Invoice shart emas, shuning uchun sendData ishlaydi
    tg.sendData(JSON.stringify({ 
        action: "sell_market", 
        item: item, 
        qty: qty, 
        price: price 
    }));
    tg.close();
}

function buyFromMarket(id) {
    tg.showConfirm("Haqiqatan ham sotib olasizmi?", (confirmed) => {
        if(confirmed) {
            tg.sendData(JSON.stringify({ action: "buy_market", market_id: id }));
            tg.close();
        }
    });
}

// ================== O'YIN MEXANIKASI ==================
function showMap() {
    currentView = 'map';
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById('map-view').style.display = 'block';
    updateUI();
}

function openBuilding(type) {
    currentView = 'building';
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById('interior-view').style.display = 'block';
    document.getElementById('room-title').innerText = CONFIG[type].name;
    renderInterior(type);
}

function updateUI() {
    document.getElementById("balance").innerText = Math.floor(game.balance);
    document.getElementById("food").innerText = game.food;
    
    document.getElementById("count-chicken").innerText = game.inventory.chicken || 0;
    document.getElementById("count-sheep").innerText = game.inventory.sheep || 0;
    document.getElementById("count-cow").innerText = game.inventory.cow || 0;

    document.getElementById("stat-egg").innerText = game.warehouse.eggs || 0;
    document.getElementById("stat-wool").innerText = game.warehouse.wool || 0;
    document.getElementById("stat-meat").innerText = game.warehouse.meat || 0;

    let xpReq = game.level * 100;
    document.getElementById("level").innerText = game.level;
    document.getElementById("xp").innerText = game.xp + " / " + xpReq;
    let percent = (game.xp / xpReq) * 100;
    if(percent > 100) percent = 100;
    document.getElementById("xp-bar").style.width = percent + "%";
}

function renderInterior(type) {
    const grid = document.getElementById("farm-grid");
    grid.innerHTML = "";
    animalTimers = []; 

    const count = game.inventory[type] || 0;
    if (count === 0) {
        grid.innerHTML = "<p style='grid-column: span 3; color: #ffe0b2; text-align: center; font-size: 18px;'>Bu yer bo'm-bo'sh...</p>";
        return;
    }

    for (let i = 0; i < count; i++) {
        createAnimalCard(type, i, grid);
    }
}

function createAnimalCard(type, index, container) {
    const card = document.createElement("div");
    card.className = "card";
    const barId = `bar-${index}`;
    const iconId = `icon-${index}`;
    let emoji = type=='chicken'?'🐔':(type=='sheep'?'🐑':'🐄');

    card.innerHTML = `
        <div class="animal-icon" id="${iconId}">${emoji}</div>
        <div class="progress-container"><div class="progress-fill" id="${barId}"></div></div>
    `;
    container.appendChild(card);

    animalTimers.push({
        id: barId, 
        iconId: iconId, 
        type: type, 
        progress: Math.random() * 80, 
        speed: 100 / (CONFIG[type].time * 10)
    });
}

// Loop
setInterval(() => {
    if (currentView !== 'building') return;
    
    animalTimers.forEach(animal => {
        if (game.food > 0) { animal.progress += animal.speed; }
        
        if (animal.progress >= 100) {
            let cost = CONFIG[animal.type].food;
            if (game.food >= cost) {
                game.food -= cost;
                animal.progress = 0;
                
                if (animal.type === 'chicken') game.warehouse.eggs++;
                if (animal.type === 'sheep') game.warehouse.wool++;
                if (animal.type === 'cow') game.warehouse.meat++;
                
                game.xp += CONFIG[animal.type].xpReward;
                let nextLvl = game.level * 100;
                if(game.xp >= nextLvl) {
                    game.xp -= nextLvl;
                    game.level++;
                    tg.showAlert(`🎉 LEVEL UP! ${game.level}-level!`);
                }

                updateUI();
                
                document.getElementById(animal.iconId).classList.add('pop');
                setTimeout(()=>document.getElementById(animal.iconId).classList.remove('pop'), 300);
            } else { 
                animal.progress = 99; 
            }
        }
        
        const bar = document.getElementById(animal.id);
        if(bar) bar.style.width = animal.progress + "%";
    });
}, 100);

// ================== DO'KON VA ACTIONS ==================
function buyAnimal(type, price) {
    if (game.level < CONFIG[type].levelReq) {
        tg.showAlert(`🔒 Bu hayvon ${CONFIG[type].levelReq}-levelda ochiladi!`);
        return;
    }
    if (game.balance >= price) {
        game.balance -= price;
        game.inventory[type] = (game.inventory[type] || 0) + 1;
        updateUI();
        tg.HapticFeedback.impactOccurred('medium');
        if (currentView === 'building') { renderInterior(type); } 
        else { tg.showAlert(`Sotib olindi!`); }
    } else { tg.showAlert("Pul yetmaydi!"); }
}

function buyFood() {
    if (game.balance >= 2) {
        game.balance -= 2;
        game.food += 5;
        updateUI();
        tg.HapticFeedback.impactOccurred('light');
    } else tg.showAlert("Pul yetmaydi!");
}

function sellAll() {
    let income = (game.warehouse.eggs * 2) + (game.warehouse.wool * 30) + (game.warehouse.meat * 100);
    if (income > 0) {
        game.balance += income;
        game.warehouse = {eggs: 0, wool: 0, meat: 0};
        updateUI();
        tg.showAlert(`Sotildi! +${income} FAM`);
    } else tg.showAlert("Ombor bo'sh!");
}

function saveGame() {
    let invStr = Object.entries(game.inventory).map(([k,v]) => `${k}:${v}`).join(',');
    let warStr = `E:${game.warehouse.eggs},W:${game.warehouse.wool},M:${game.warehouse.meat}`;
    tg.sendData(JSON.stringify({
        balance: game.balance, inventory: invStr, warehouse: warStr, food: game.food,
        level: game.level, xp: game.xp
    }));
}

// Boshlash
updateUI();