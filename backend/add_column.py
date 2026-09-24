import sqlite3

conn = sqlite3.connect('scm_erp.db')
cursor = conn.cursor()
try:
    cursor.execute("ALTER TABLE orders ADD COLUMN delivery_request_date VARCHAR;")
    conn.commit()
    print("Column added successfully.")
except Exception as e:
    print(f"Error: {e}")
conn.close()
