const tg = window.Telegram.WebApp;
tg.expand();
const urlParams = new URLSearchParams(window.location.search);

// SOZLAMALAR: Level talabi va XP mukofoti
const CONFIG = {
    chicken: { time: 3, food: 1, name: "TOVUQXONA", levelReq: 1, xpReward: 10 },
    sheep:   { time: 5, food: 2, name: "QO'YXONA", levelReq: 3, xpReward: 20 },
    cow:     { time: 8, food: 3, name: "MOLXONA", levelReq: 5, xpReward: 50 }
};

let game = {
    balance: parseInt(urlParams.get('b')) || 10,
    food: parseInt(urlParams.get('f')) || 5,
    inventory: parseInventory(urlParams.get('i')),
    warehouse: parseWarehouse(urlParams.get('w')),
    level: parseInt(urlParams.get('l')) || 1, 
    xp: parseInt(urlParams.get('x')) || 0
};

let animalTimers = [];
let currentView = 'map'; 

function parseInventory(str) {
    if (!str) return {};
    let inv = {};
    str.split(',').forEach(item => {
        let [type, count] = item.split(':');
        if (type && count) inv[type] = parseInt(count);
    });
    return inv;
}

function parseWarehouse(str) {
    if (!str) return {eggs: 0, wool: 0, meat: 0};
    let wh = {eggs: 0, wool: 0, meat: 0};
    str.split(',').forEach(p => { 
        if(p.includes(':')) { 
            let [k,v]=p.split(':'); 
            wh[getFullKey(k)]=parseInt(v); 
        }
    });
    return wh;
}

function getFullKey(k) { 
    if(k=='E') return 'eggs'; 
    if(k=='W') return 'wool'; 
    if(k=='M') return 'meat'; 
    return k; 
}

// --- XP VA LEVEL TIZIMI ---
function getXpForNextLevel() { 
    return game.level * 100; 
}

function addXp(amount) {
    game.xp += amount;
    let nextLvl = getXpForNextLevel();
    if (game.xp >= nextLvl) {
        game.xp -= nextLvl;
        game.level++;
        tg.showAlert(`🎉 LEVEL UP! Siz endi ${game.level}-levelsiz!`);
    }
    updateUI();
}

function updateUI() {
    document.getElementById("balance").innerText = Math.floor(game.balance);
    document.getElementById("food").innerText = game.food;
    
    document.getElementById("count-chicken").innerText = game.inventory.chicken || 0;
    document.getElementById("count-sheep").innerText = game.inventory.sheep || 0;
    document.getElementById("count-cow").innerText = game.inventory.cow || 0;

    // Ombor statistikasi
    document.getElementById("stat-egg").innerText = game.warehouse.eggs || 0;
    document.getElementById("stat-wool").innerText = game.warehouse.wool || 0;
    document.getElementById("stat-meat").innerText = game.warehouse.meat || 0;

    // Level va XP Bar
    document.getElementById("level").innerText = game.level;
    document.getElementById("xp").innerText = game.xp + " / " + getXpForNextLevel();
    let percent = (game.xp / getXpForNextLevel()) * 100;
    document.getElementById("xp-bar").style.width = percent + "%";
}

function showMap() {
    currentView = 'map';
    document.getElementById("map-view").style.display = "block";
    document.getElementById("interior-view").style.display = "none";
    updateUI();
}

function openBuilding(type) {
    currentView = 'building';
    document.getElementById("map-view").style.display = "none";
    document.getElementById("interior-view").style.display = "block";
    document.getElementById("room-title").innerText = CONFIG[type].name;
    renderInterior(type);
}

function renderInterior(type) {
    const grid = document.getElementById("farm-grid");
    grid.innerHTML = "";
    animalTimers = []; 

    const count = game.inventory[type] || 0;
    if (count === 0) {
        grid.innerHTML = "<p style='grid-column: span 3; color: #ffe0b2; text-align: center; font-size: 18px;'>Bu yer bo'm-bo'sh...<br>Do'kondan jonivor oling!</p>";
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

// --- O'YIN TAYMERI ---
setInterval(() => {
    if (currentView !== 'building') return;
    animalTimers.forEach(animal => {
        if (game.food > 0) { animal.progress += animal.speed; }
        if (animal.progress >= 100) {
            let cost = CONFIG[animal.type].food;
            if (game.food >= cost) {
                game.food -= cost;
                animal.progress = 0;
                produceItem(animal.type);
                addXp(CONFIG[animal.type].xpReward); // XP qo'shish
                updateUI();
                document.getElementById(animal.iconId).classList.add('pop');
                setTimeout(()=>document.getElementById(animal.iconId).classList.remove('pop'), 300);
            } else { animal.progress = 99; }
        }
        const bar = document.getElementById(animal.id);
        if(bar) bar.style.width = animal.progress + "%";
    });
}, 100);

function produceItem(type) {
    if (type === 'chicken') game.warehouse.eggs++;
    if (type === 'sheep') game.warehouse.wool++;
    if (type === 'cow') game.warehouse.meat++;
}

function openShop() { document.getElementById("shop-modal").style.display = "block"; }
function closeShop() { document.getElementById("shop-modal").style.display = "none"; }

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

function buyRealMoney() {
    tg.sendData(JSON.stringify({ action: "buy_stars_pack" }));
    tg.close();
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
updateUI();