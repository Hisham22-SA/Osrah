import { db } from './database.js';
import { readFileSync } from 'node:fs';

// Adds the reviewed Saudi food catalog once, while preserving customer data,
// orders, and any products that families have created themselves.
export function expandDemoFoods() {
  const migration = 'expanded-demo-foods-v1';
  if (db.prepare('SELECT name FROM migrations WHERE name=?').get(migration)) return { alreadyApplied: true };

  const additions = JSON.parse(readFileSync(new URL('./demo/proposed-data.json', import.meta.url), 'utf8'))
    .products.filter(product => Number(product.id.split('-')[1]) > 30);

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE products SET name=?, description=? WHERE demo_key=?').run(
      'جريش نجدي', 'جريش قمح مجروش مطهو ببطء مع البصل والبهارات على الطريقة النجدية.', 'product-1');
    db.prepare('UPDATE products SET name=?, description=? WHERE demo_key=?').run(
      'مرقوق نجدي', 'عجين مرقوق رقيق مطهو مع الخضار والمرق على الطريقة النجدية.', 'product-2');
    const insert = db.prepare(`INSERT OR IGNORE INTO products
      (family_id,name,description,category,region,price,stock,preparation,delivery,gift,demo_key)
      VALUES(?,?,?,'Food',?,?,?,?,'both',?,?)`);
    let inserted = 0;
    for (const product of additions) {
      const family = db.prepare('SELECT id FROM users WHERE demo_key=? AND role=?').get(product.familyId, 'family');
      if (!family) continue;
      inserted += insert.run(family.id, product.name, product.description, product.region, product.priceHalalas, product.stock, product.preparationHours, product.giftSuitable ? 1 : 0, product.id).changes;
    }
    db.prepare('INSERT INTO migrations(name) VALUES(?)').run(migration);
    db.exec('COMMIT');
    return { inserted };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
