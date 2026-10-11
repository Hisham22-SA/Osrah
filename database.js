import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
export const db = new DatabaseSync(process.env.OSRAH_DB || fileURLToPath(new URL('./data/osrah.sqlite', import.meta.url)));
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,approved INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,family_id INTEGER REFERENCES users(id),name TEXT NOT NULL,description TEXT NOT NULL,category TEXT NOT NULL,region TEXT NOT NULL,price INTEGER NOT NULL,stock INTEGER NOT NULL,preparation INTEGER NOT NULL,delivery TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS schedules(family_id INTEGER PRIMARY KEY REFERENCES users(id),weekly TEXT NOT NULL,exceptions TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,type TEXT NOT NULL,product_id INTEGER REFERENCES products(id),query TEXT,created_at TEXT NOT NULL,demo_key TEXT UNIQUE);
CREATE INDEX IF NOT EXISTS events_actor ON events(actor);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,customer_id INTEGER REFERENCES users(id),family_id INTEGER REFERENCES users(id),total INTEGER NOT NULL,status TEXT NOT NULL,payment_status TEXT NOT NULL,scheduled_at TEXT NOT NULL,created_at TEXT NOT NULL,synthetic INTEGER NOT NULL DEFAULT 0,demo_key TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS order_items(order_id INTEGER REFERENCES orders(id),product_id INTEGER REFERENCES products(id),quantity INTEGER NOT NULL,unit_price INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY);`);
db.exec(`CREATE TABLE IF NOT EXISTS family_applications(family_id INTEGER PRIMARY KEY REFERENCES users(id),phone TEXT NOT NULL,city TEXT NOT NULL,license_number TEXT NOT NULL,license_expiry TEXT NOT NULL,filename TEXT NOT NULL,mime TEXT NOT NULL,document TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',reason TEXT NOT NULL DEFAULT '',submitted_at TEXT NOT NULL);`);
db.exec(`CREATE TABLE IF NOT EXISTS family_locations(family_id INTEGER PRIMARY KEY REFERENCES users(id),latitude REAL NOT NULL,longitude REAL NOT NULL,address TEXT NOT NULL,has_driver INTEGER NOT NULL DEFAULT 0,synthetic INTEGER NOT NULL DEFAULT 0);`);
db.exec(`CREATE TABLE IF NOT EXISTS payment_sessions(id TEXT PRIMARY KEY,customer_id INTEGER NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,currency TEXT NOT NULL DEFAULT 'SAR',method TEXT NOT NULL,status TEXT NOT NULL,gateway_id TEXT,checkout_url TEXT,order_ids TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
for (const [table,column,type] of [['users','demo_key','TEXT'],['products','demo_key','TEXT'],['products','gift','INTEGER NOT NULL DEFAULT 0'],['orders','fulfillment',"TEXT NOT NULL DEFAULT 'pickup'"],['orders','delivery_address',"TEXT NOT NULL DEFAULT ''"]]) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_demo_key ON users(demo_key); CREATE UNIQUE INDEX IF NOT EXISTS products_demo_key ON products(demo_key);');
