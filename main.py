import asyncio
import logging
import sqlite3
import json
import os
import time
import html

from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import CommandStart, CommandObject, Command
from aiogram.utils.keyboard import InlineKeyboardBuilder 
from aiogram.client.default import DefaultBotProperties

# ================== SOZLAMALAR ==================
TOKEN = "8342014111:AAHw5QoiqADo6Ay749ZMGdGhCy2wv4zqCww" 
MINI_APP_URL = "https://merjan777.github.io/my-mini-app/"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "game_data.db")

bot = Bot(token=TOKEN, default=DefaultBotProperties(parse_mode="HTML"))
dp = Dispatcher()
logging.basicConfig(level=logging.INFO)

# ================== BAZA VA MIGRATSIYA ==================
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Users jadvali
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        full_name TEXT,
        balance INTEGER DEFAULT 10,
        inventory TEXT DEFAULT '{}',
        warehouse TEXT DEFAULT '{"eggs":0,"wool":0,"meat":0}',
        food INTEGER DEFAULT 5,
        level INTEGER DEFAULT 1,
        xp INTEGER DEFAULT 0,
        last_online INTEGER DEFAULT 0,
        invites INTEGER DEFAULT 0,
        last_bonus_time INTEGER DEFAULT 0
    )
    """)
    
    # Market jadvali
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS market (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id INTEGER,
        seller_name TEXT,
        item_type TEXT,
        quantity INTEGER,
        price INTEGER,
        date INTEGER
    )
    """)

    # 🔥 MIGRATION: Agar full_name ustuni bo'lmasa, qo'shish
    cursor.execute("PRAGMA table_info(users)")
    cols = [c[1] for c in cursor.fetchall()]
    if "full_name" not in cols:
        cursor.execute("ALTER TABLE users ADD COLUMN full_name TEXT")

    conn.commit()
    conn.close()

# ================== URL GENERATOR ==================
def get_game_url(user_id):
    conn = sqlite3.connect(DB_PATH); cursor = conn.cursor()
    user = cursor.execute("SELECT balance, inventory, warehouse, food, level, xp FROM users WHERE user_id=?", (user_id,)).fetchone()
    market_items = cursor.execute("SELECT id, seller_name, item_type, quantity, price FROM market ORDER BY date DESC LIMIT 30").fetchall()
    conn.close()

    if not user: return MINI_APP_URL 

    balance = user[0]
    try: inv = json.loads(user[1]) if user[1] else {}
    except: inv = {}
    try: wh = json.loads(user[2]) if user[2] else {}
    except: wh = {}
    
    inv_str = ",".join([f"{k}:{v}" for k, v in inv.items()])
    ware_str = f"eggs:{wh.get('eggs',0)},wool:{wh.get('wool',0)},meat:{wh.get('meat',0)}"
    m_list = [f"{m[0]}:{m[1].replace(':','')[:10]}:{m[2]}:{m[3]}:{m[4]}" for m in market_items]
    
    return f"{MINI_APP_URL}?b={balance}&f={user[3]}&l={user[4]}&x={user[5]}&i={inv_str}&w={ware_str}&m={'|'.join(m_list)}"

# ================== START HANDLER (DEEP LINK + REFERRAL) ==================
@dp.message(CommandStart())
async def start(message: types.Message, command: CommandObject):
    init_db()
    user_id = message.from_user.id
    full_name = html.escape(message.from_user.full_name)
    now = int(time.time())
    
    payload = command.args 

    # --- 1. TO'LOV TEKSHIRISH (FIXED ARGUMENTS) ---
    if payload == "buy_special":
        await bot.send_invoice(
            chat_id=message.chat.id,
            title="🔥 SUPER PACK",
            description="5000 FAM + 50 Yem + 1 Sigir (Chegirma!)",
            payload="special_offer_pack",
            provider_token="", 
            currency="XTR",
            prices=[types.LabeledPrice(label="Super Pack", amount=100)]
        )
        return
    elif payload == "buy_coins" or payload == "buy_stars_pack":
        await bot.send_invoice(
            chat_id=message.chat.id,
            title="💰 1000 FAM",
            description="Fermer paketi (1000 FAM + 10 Yem)",
            payload="pack_1000_fam",
            provider_token="", 
            currency="XTR",
            prices=[types.LabeledPrice(label="1000 FAM", amount=50)]
        )
        return

    # --- 2. USERNI BAZAGA YOZISH ---
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    user = cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    
    msg_text = ""
    if not user:
        cursor.execute("INSERT INTO users (user_id, full_name, balance, food, level, xp, last_online, invites) VALUES (?, ?, 10, 5, 1, 0, ?, 0)", (user_id, full_name, now))
        msg_text = f"👋 Salom, {full_name}!\n🌾 <b>Fermangiz ochildi!</b>"
        
        # Referral logikasi
        if payload and payload.isdigit():
            referrer_id = int(payload)
            if referrer_id != user_id:
                ref_user = cursor.execute("SELECT user_id FROM users WHERE user_id=?", (referrer_id,)).fetchone()
                if ref_user:
                    cursor.execute("UPDATE users SET balance=balance+500, food=food+5, invites=invites+1 WHERE user_id=?", (referrer_id,))
                    cursor.execute("UPDATE users SET balance=balance+100 WHERE user_id=?", (user_id,))
                    try: await bot.send_message(referrer_id, f"🎉 <b>Do'stingiz {full_name} qo'shildi!</b>\nSizga +500 FAM va +5 Yem berildi.")
                    except: pass
                    msg_text += "\n🎁 <b>Referral bonusi:</b> +100 FAM!"
        conn.commit()
    else:
        cursor.execute("UPDATE users SET full_name=?, last_online=? WHERE user_id=?", (full_name, now, user_id))
        conn.commit()
        msg_text = f"🏡 <b>Fermaga xush kelibsiz!</b>"

    conn.close()

    bot_username = (await bot.get_me()).username
    kb = InlineKeyboardBuilder()
    
    kb.row(types.InlineKeyboardButton(text="🚜 O'yinni Boshlash", web_app=types.WebAppInfo(url=get_game_url(user_id))))
    kb.row(types.InlineKeyboardButton(text="🔄 Yangilash", callback_data="refresh"), types.InlineKeyboardButton(text="🏆 Reyting", callback_data="top_10"))
    kb.row(types.InlineKeyboardButton(text="🎁 Bonus", callback_data="daily_bonus"), types.InlineKeyboardButton(text="🔗 Do'stlar", callback_data="invite_friends"))
    kb.row(types.InlineKeyboardButton(text="🔥 Aksiya (100⭐️)", url=f"https://t.me/{bot_username}?start=buy_special"))
    kb.row(types.InlineKeyboardButton(text="💰 1000 FAM (50⭐️)", url=f"https://t.me/{bot_username}?start=buy_coins"))

    await message.answer(msg_text, reply_markup=kb.as_markup())

# ================== TO'LOV HANDLERLARI ==================
@dp.pre_checkout_query()
async def pre_check(q):
    await bot.answer_pre_checkout_query(q.id, ok=True)

@dp.message(F.successful_payment)
async def success_pay(m):
    user_id = m.from_user.id
    payload = m.successful_payment.invoice_payload
    conn = sqlite3.connect(DB_PATH); cursor = conn.cursor()
    
    msg = ""
    if payload == "pack_1000_fam":
        cursor.execute("UPDATE users SET balance = balance + 1000, food = food + 10 WHERE user_id = ?", (user_id,))
        msg = "🎉 <b>To'lov Muvaffaqiyatli!</b>\n+1000 FAM va +10 Yem."
    elif payload == "special_offer_pack":
        cursor.execute("UPDATE users SET balance = balance + 5000, food = food + 50 WHERE user_id = ?", (user_id,))
        u = cursor.execute("SELECT inventory FROM users WHERE user_id=?", (user_id,)).fetchone()
        inv = json.loads(u[0])
        inv['cow'] = inv.get('cow', 0) + 1
        cursor.execute("UPDATE users SET inventory=? WHERE user_id=?", (json.dumps(inv), user_id))
        msg = "🔥 <b>SUPER AKSIYA!</b>\n+5000 FAM, +50 Yem, +1 Sigir!"

    conn.commit(); conn.close()
    await m.answer(msg)

# ================== WEBAPP (MARKET & SAVE) ==================
@dp.message(F.web_app_data)
async def handle_webapp(message: types.Message):
    try:
        data = json.loads(message.web_app_data.data)
        user_id = message.from_user.id
        full_name = html.escape(message.from_user.full_name)
        now = int(time.time())
        conn = sqlite3.connect(DB_PATH); cursor = conn.cursor()
        action = data.get("action")

        if action == "sell_market":
            item=data.get("item"); qty=int(data.get("qty")); price=int(data.get("price"))
            u=cursor.execute("SELECT warehouse FROM users WHERE user_id=?",(user_id,)).fetchone()
            wh=json.loads(u[0])
            if wh.get(item,0)>=qty:
                wh[item]-=qty
                cursor.execute("UPDATE users SET warehouse=? WHERE user_id=?",(json.dumps(wh),user_id))
                cursor.execute("INSERT INTO market (seller_id,seller_name,item_type,quantity,price,date) VALUES (?,?,?,?,?,?)",(user_id,full_name,item,qty,price,now))
                conn.commit()
                await message.answer(f"✅ <b>Sotuvga:</b> {qty}x {item}")
            else: await message.answer("❌ Yetmaydi!")

        elif action == "buy_market":
            m_id=int(data.get("market_id"))
            deal=cursor.execute("SELECT seller_id,item_type,quantity,price FROM market WHERE id=?",(m_id,)).fetchone()
            if deal:
                sid,item,qty,price=deal
                if sid == user_id: 
                    await message.answer("❌ O'zingizdan ololmaysiz!"); conn.close(); return
                
                buyer=cursor.execute("SELECT balance,warehouse FROM users WHERE user_id=?",(user_id,)).fetchone()
                if buyer[0]>=price:
                    cursor.execute("UPDATE users SET balance=balance-? WHERE user_id=?",(price,user_id))
                    wh=json.loads(buyer[1]); wh[item]=wh.get(item,0)+qty
                    cursor.execute("UPDATE users SET warehouse=? WHERE user_id=?",(json.dumps(wh),user_id))
                    cursor.execute("UPDATE users SET balance=balance+? WHERE user_id=?",(price,sid))
                    cursor.execute("DELETE FROM market WHERE id=?",(m_id,)); conn.commit()
                    await message.answer(f"✅ <b>Olindi:</b> {qty}x {item}")
                else: await message.answer("❌ Pul yo'q!")
            else: await message.answer("❌ Sotilgan!")
        
        else: # Auto Save
            inv={}; wh={"eggs":0,"wool":0,"meat":0}
            if data.get("inventory"):
                for i in data.get("inventory").split(','):
                    if ':' in i: k,v=i.split(':'); inv[k]=int(v)
            if data.get("warehouse"):
                for p in data.get("warehouse").split(','):
                    if ':' in p: k,v=p.split(':'); km={'E':'eggs','W':'wool','M':'meat'}; wh[km.get(k,k)]=int(v)
            
            cursor.execute("UPDATE users SET full_name=?, balance=?, inventory=?, warehouse=?, food=?, level=?, xp=?, last_online=? WHERE user_id=?", 
                           (full_name, int(data.get("balance",0)), json.dumps(inv), json.dumps(wh), int(data.get("food",0)), int(data.get("level",1)), int(data.get("xp",0)), now, user_id))
            conn.commit()
        conn.close()
    except Exception as e: logging.error(e)

# ================== CALLBACKS ==================
@dp.callback_query(F.data == "refresh")
async def r(c: types.CallbackQuery): 
    dummy = CommandObject(prefix="/", command="start", args=None)
    await start(c.message, dummy)
    await c.message.delete()

@dp.callback_query(F.data == "top_10")
async def t(c: types.CallbackQuery):
    conn = sqlite3.connect(DB_PATH); top = conn.cursor().execute("SELECT full_name, balance FROM users ORDER BY balance DESC LIMIT 10").fetchall(); conn.close()
    text = "🏆 <b>TOP 10</b>\n" + "\n".join([f"{i+1}. {html.escape(u[0] if u[0] else 'Fermer')} - {u[1]}" for i, u in enumerate(top)])
    kb = InlineKeyboardBuilder(); kb.row(types.InlineKeyboardButton(text="⬅️ Orqaga", callback_data="refresh"))
    await c.message.edit_text(text, reply_markup=kb.as_markup())

@dp.callback_query(F.data == "daily_bonus")
async def b(c: types.CallbackQuery):
    uid = c.from_user.id; now = int(time.time()); conn = sqlite3.connect(DB_PATH); cur = conn.cursor()
    u = cur.execute("SELECT last_bonus_time FROM users WHERE user_id=?", (uid,)).fetchone()
    last = u[0] if u else 0
    if now - last >= 86400:
        cur.execute("UPDATE users SET balance=balance+100, last_bonus_time=? WHERE user_id=?", (now, uid)); conn.commit(); await c.answer("✅ +100 FAM!", show_alert=True)
    else: await c.answer("⏳ Bonusga hali bor!", show_alert=True)
    conn.close()

@dp.callback_query(F.data == "invite_friends")
async def i(c: types.CallbackQuery): 
    me = await bot.get_me()
    kb = InlineKeyboardBuilder(); kb.row(types.InlineKeyboardButton(text="⬅️ Orqaga", callback_data="refresh"))
    await c.message.edit_text(f"🔗 <b>Sizning referal ssilkangiz:</b>\n<code>https://t.me/{me.username}?start={c.from_user.id}</code>", reply_markup=kb.as_markup())

# ================== ASOSIY ==================
async def main():
    init_db()
    print("Bot ishga tushdi...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    try: asyncio.run(main())
    except KeyboardInterrupt: print("Bot to'xtatildi")