import asyncio
import logging
import sqlite3
import json
import os
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.utils.keyboard import InlineKeyboardBuilder

# --- SOZLAMALAR ---
TOKEN = "8342014111:AAFb84Bvsg49CldK4Vv3xPNXY0nrvyWK1cM"
MINI_APP_URL = "https://merjan777.github.io/my-mini-app/"

bot = Bot(token=TOKEN)
dp = Dispatcher()
logging.basicConfig(level=logging.INFO)

# Render serverida ma'lumotlar o'chmasligi uchun doimiy disk yo'li
DB_PATH = "/data/game_data.db" if os.path.exists("/data") else "game_data.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Barcha kerakli ustunlar bilan bazani yaratish
    cursor.execute('''CREATE TABLE IF NOT EXISTS users 
                      (user_id INTEGER PRIMARY KEY, 
                       balance INTEGER DEFAULT 100, 
                       inventory TEXT DEFAULT '',
                       warehouse TEXT DEFAULT 'E:0,W:0,M:0',
                       referred_by INTEGER DEFAULT 0)''')
    conn.commit()
    conn.close()

def get_url_with_params(user_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    user = cursor.execute("SELECT balance, inventory, warehouse FROM users WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    
    b = user[0] if user else 100
    i = user[1] if user else ""
    w = user[2] if user else "E:0,W:0,M:0"
    # Yangilangan UI uchun parametrlarni URL ga biriktirish
    return f"{MINI_APP_URL}?b={b}&i={i}&w={w}"

@dp.message(Command("start"))
async def start(message: types.Message):
    init_db()
    user_id = message.from_user.id
    
    # Referal ID ni aniqlash (/start 123456)
    args = message.text.split()
    referrer_id = int(args[1]) if len(args) > 1 and args[1].isdigit() else 0

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Foydalanuvchi bazada bor-yo'qligini tekshirish
    user = cursor.execute("SELECT user_id FROM users WHERE user_id = ?", (user_id,)).fetchone()
    
    if not user:
        # Yangi foydalanuvchini ro'yxatdan o'tkazish
        cursor.execute("INSERT INTO users (user_id, balance, referred_by) VALUES (?, 100, ?)", (user_id, referrer_id))
        
        # Taklif qilgan odamga 50 FAM coin bonus berish
        if referrer_id != 0 and referrer_id != user_id:
            cursor.execute("UPDATE users SET balance = balance + 50 WHERE user_id = ?", (referrer_id,))
            try:
                await bot.send_message(referrer_id, "🎁 **Yangi fermer qo'shildi!**\nSizga 50 FAM bonus berildi! 💰")
            except:
                pass
        conn.commit()
    conn.close()
    
    url = get_url_with_params(user_id)
    bot_info = await bot.get_me()
    ref_link = f"https://t.me/{bot_info.username}?start={user_id}" 

    # Menyu tugmasini yangi URL bilan sozlash
    await bot.set_chat_menu_button(
        chat_id=message.chat.id,
        menu_button=types.MenuButtonWebApp(text="Ferma 🚜", web_app=types.WebAppInfo(url=url))
    )
    
    builder = InlineKeyboardBuilder()
    builder.row(types.InlineKeyboardButton(text="🚜 Fermaga kirish (v2.0)", web_app=types.WebAppInfo(url=url)))
    builder.row(types.InlineKeyboardButton(text="⭐ 1000 FAM olish (50 XTR)", callback_data="buy_1000_fam"))
    builder.row(types.InlineKeyboardButton(text="🔗 Do'stlarni taklif qilish", switch_inline_query=f"\nMen bilan Hay Day o'yna! Har bir do'st uchun 50 FAM bonus! 👇\n{ref_link}"))
    
    await message.answer(f"🏡 **HAY DAY: GOLDEN EDITION**\n\nFermangiz yangi dizaynda tayyor! Do'stlarni chaqiring va Stars orqali tezroq rivojlaning. 💰", 
                         reply_markup=builder.as_markup(), parse_mode="Markdown")

# --- TELEGRAM STARS TO'LOV TIZIMI ---

@dp.callback_query(F.data == "buy_1000_fam")
async def send_payment_invoice(callback: types.CallbackQuery):
    prices = [types.LabeledPrice(label="1000 FAM Coin", amount=50)] 
    await bot.send_invoice(
        chat_id=callback.from_user.id,
        title="Fermani rivojlantirish",
        description="Fermangiz uchun 1000 ta oltin FAM coin sotib oling!",
        payload="stars_1000_fam",
        provider_token="", 
        currency="XTR", # Telegram Stars valyutasi
        prices=prices
    )

@dp.pre_checkout_query()
async def process_pre_checkout(pre_checkout_query: types.PreCheckoutQuery):
    await bot.answer_pre_checkout_query(pre_checkout_query.id, ok=True)

@dp.message(F.successful_payment)
async def handle_successful_payment(message: types.Message):
    user_id = message.from_user.id
    payload = message.successful_payment.invoice_payload
    if payload == "stars_1000_fam":
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET balance = balance + 1000 WHERE user_id = ?", (user_id,))
        conn.commit()
        conn.close()
        await message.answer("✅ **Muvaffaqiyatli!**\nBalansingizga 1000 FAM qo'shildi. O'yinni qayta ochishingiz mumkin. 💰")

# --- O'YIN MA'LUMOTLARINI SAQLASH ---

@dp.message(F.web_app_data)
async def handle_save(message: types.Message):
    try:
        data = json.loads(message.web_app_data.data)
        
        # Mini App ichidan Stars xaridi so'rovi kelsa
        if data.get("action") == "stars_purchase":
            prices = [types.LabeledPrice(label="1000 FAM Coin", amount=50)] 
            await bot.send_invoice(chat_id=message.chat.id, title="1000 FAM", description="Tezkor xarid", payload="stars_1000_fam", provider_token="", currency="XTR", prices=prices)
            return

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET balance = ?, inventory = ?, warehouse = ? WHERE user_id = ?", 
                       (int(data.get("balance", 100)), data.get("inventory", ""), data.get("warehouse", "E:0,W:0,M:0"), message.from_user.id))
        conn.commit()
        conn.close()
        await message.answer(f"💾 **Holat saqlandi!**")
    except Exception as e:
        logging.error(f"Xato: {e}")

async def main():
    init_db()
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())