import sqlite3
import os

db_paths = [
    'scm_erp.db',
    os.path.join(os.path.dirname(__file__), 'scm_erp.db'),
    os.path.join(os.path.dirname(__file__), '..', '..', 'scm_erp.db')
]

for p in db_paths:
    if os.path.exists(p):
        try:
            conn = sqlite3.connect(p)
            cursor = conn.cursor()
            cursor.execute("UPDATE orders SET warehouse = vessel WHERE (warehouse IS NULL OR warehouse = '') AND vessel IS NOT NULL AND vessel != '';")
            conn.commit()
            print(f"Synced vessel to warehouse in {p}")
            conn.close()
        except Exception as e:
            print(f"Error syncing {p}: {e}")

