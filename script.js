const tg = window.Telegram.WebApp;
tg.expand();
const urlParams = new URLSearchParams(window.location.search);

const CONFIG = {
    chicken: { time: 3, food: 1, name: "TOVUQXONA" },
    sheep:   { time: 5, food: 2, name: "QO'YXONA" },
    cow:     { time: 8, food: 3, name: "MOLXONA" }
};

let game = {
    balance: parseInt(urlParams.get('b')) || 10,
    food: parseInt(urlParams.get('f')) || 5,
    inventory: parseInventory(urlParams.get('i')),
    warehouse: parseWarehouse(urlParams.get('w'))
};

let animalTimers = [];
let currentView = 'map'; 
let currentBuilding = null; 

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
    str.split(',').forEach(p => { if(p.includes(':')) { let [k,v]=p.split(':'); wh[getFullKey(k)]=parseInt(v); }});
    return wh;
}
function getFullKey(k) { if(k=='E')return 'eggs'; if(k=='W')return 'wool'; if(k=='M')return 'meat'; return k; }

function updateUI() {
    document.getElementById("balance").innerText = Math.floor(game.balance);
    document.getElementById("food").innerText = game.food;
    document.getElementById("count-chicken").innerText = game.inventory.chicken || 0;
    document.getElementById("count-sheep").innerText = game.inventory.sheep || 0;
    document.getElementById("count-cow").innerText = game.inventory.cow || 0;
}

function showMap() {
    currentView = 'map';
    currentBuilding = null;
    document.getElementById("map-view").style.display = "block";
    document.getElementById("interior-view").style.display = "none";
    updateUI();
}

function openBuilding(type) {
    currentView = 'building';
    currentBuilding = type;
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
    const imgId = `img-${index}`;
    
    let imgUrl = '';
    if(type=='chicken') imgUrl = 'https://cdn-icons-png.flaticon.com/512/1828/1828884.png';
    if(type=='sheep') imgUrl = 'https://cdn-icons-png.flaticon.com/512/1998/1998610.png';
    if(type=='cow') imgUrl = 'https://cdn-icons-png.flaticon.com/512/1998/1998627.png';

    card.innerHTML = `
        <img src="${imgUrl}" class="animal-img" id="${imgId}">
        <div class="progress-container"><div class="progress-fill" id="${barId}"></div></div>
    `;
    container.appendChild(card);

    animalTimers.push({
        id: barId, imgId: imgId, type: type,
        progress: Math.random() * 80, speed: 100 / (CONFIG[type].time * 10)
    });
}

// O'YIN TAYMERI
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
                updateUI();
                document.getElementById(animal.imgId).classList.add('pop');
                setTimeout(()=>document.getElementById(animal.imgId).classList.remove('pop'), 300);
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
    if (game.balance >= price) {
        game.balance -= price;
        game.inventory[type] = (game.inventory[type] || 0) + 1;
        updateUI();
        tg.HapticFeedback.impactOccurred('medium');
        if (currentView === 'building' && currentBuilding === type) { renderInterior(type); } 
        else { tg.showAlert(`Sotib olindi! ${CONFIG[type].name}ga qarang.`); }
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

// HAQIQIY PULGA SOTIB OLISH (Stars)
function buyRealMoney() {
    tg.sendData(JSON.stringify({
        action: "buy_stars_pack"
    }));
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
        balance: game.balance, inventory: invStr, warehouse: warStr, food: game.food
    }));
}
updateUI();